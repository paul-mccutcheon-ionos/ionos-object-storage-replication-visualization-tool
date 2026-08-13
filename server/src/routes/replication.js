import { Router } from 'express';
import crypto from 'node:crypto';
import {
  GetBucketVersioningCommand,
  PutBucketVersioningCommand,
  GetBucketReplicationCommand,
  PutBucketReplicationCommand,
  DeleteBucketReplicationCommand,
  GetObjectLockConfigurationCommand,
} from '@aws-sdk/client-s3';
import { getClientForRegion } from '../s3Client.js';
import { findRegion } from '../regions.js';
import { listAllBuckets } from '../bucketService.js';

const router = Router({ mergeParams: true });

// IONOS ignores the IAM Role field on replication configs (no AWS-style IAM
// roles), but the S3 API schema still requires the element to be present.
const PLACEHOLDER_ROLE = 'arn:aws:iam::000000000000:role/not-used-by-ionos';

function bucketArn(bucketName) {
  return `arn:aws:s3:::${bucketName}`;
}

// Cross-System Replication (Cloudian user-owned -> Ceph contract-owned)
// isn't part of the public S3 API - Cloudian needs two proprietary headers
// telling it where and how to reach the Ceph side, or it has no way to
// resolve the destination (surfaced as its "No endpoint specified" error).
// It also requires a Content-MD5 of the exact request body.
function addCsrHeaders(command, { endpoint, accessKey, secretKey }) {
  command.middlewareStack.add(
    (next) => async (args) => {
      args.request.headers['x-gmt-crr-endpoint'] = endpoint;
      args.request.headers['x-gmt-crr-credentials'] = `${accessKey}:${secretKey}`;
      if (typeof args.request.body === 'string') {
        args.request.headers['Content-MD5'] = crypto.createHash('md5').update(args.request.body).digest('base64');
      }
      return next(args);
    },
    { step: 'build', name: 'csrHeaders' },
  );
}

function notFound(err) {
  return (
    err?.name === 'NoSuchBucket' ||
    err?.name === 'ReplicationConfigurationNotFoundError' ||
    err?.Code === 'ReplicationConfigurationNotFoundError' ||
    err?.$metadata?.httpStatusCode === 404
  );
}

router.get('/versioning', async (req, res) => {
  const { region, bucket } = req.params;
  try {
    findRegion(region);
    const client = getClientForRegion(region);
    const out = await client.send(new GetBucketVersioningCommand({ Bucket: bucket }));
    res.json({ status: out.Status || 'Disabled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/versioning', async (req, res) => {
  const { region, bucket } = req.params;
  const { status } = req.body; // 'Enabled' | 'Suspended'
  if (!['Enabled', 'Suspended'].includes(status)) {
    return res.status(400).json({ error: "status must be 'Enabled' or 'Suspended'" });
  }
  try {
    findRegion(region);
    const client = getClientForRegion(region);
    await client.send(
      new PutBucketVersioningCommand({
        Bucket: bucket,
        VersioningConfiguration: { Status: status },
      }),
    );
    res.json({ status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/object-lock', async (req, res) => {
  const { region, bucket } = req.params;
  try {
    findRegion(region);
    const client = getClientForRegion(region);
    const out = await client.send(new GetObjectLockConfigurationCommand({ Bucket: bucket }));
    const config = out.ObjectLockConfiguration;
    const retention = config?.Rule?.DefaultRetention;
    res.json({
      enabled: config?.ObjectLockEnabled === 'Enabled',
      mode: retention?.Mode || null,
      retentionDays: retention?.Days ?? null,
      retentionYears: retention?.Years ?? null,
    });
  } catch (err) {
    if (err.Code === 'ObjectLockConfigurationNotFoundError' || err?.$metadata?.httpStatusCode === 404) {
      return res.json({ enabled: false, mode: null, retentionDays: null, retentionYears: null });
    }
    res.status(500).json({ error: err.message });
  }
});

router.get('/replication', async (req, res) => {
  const { region, bucket } = req.params;
  try {
    findRegion(region);
    const client = getClientForRegion(region);
    const out = await client.send(new GetBucketReplicationCommand({ Bucket: bucket }));
    const rules = (out.ReplicationConfiguration?.Rules || []).map((rule) => ({
      id: rule.ID,
      status: rule.Status,
      prefix: rule.Filter?.Prefix ?? rule.Prefix ?? '',
      destinationBucket: (rule.Destination?.Bucket || '').replace('arn:aws:s3:::', ''),
      destinationStorageClass: rule.Destination?.StorageClass,
    }));
    res.json({ rules });
  } catch (err) {
    if (notFound(err)) {
      return res.json({ rules: [] });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/replication', async (req, res) => {
  const { region, bucket } = req.params;
  const { rules } = req.body;

  if (!Array.isArray(rules) || rules.length === 0) {
    return res.status(400).json({ error: 'At least one replication rule is required' });
  }

  for (const rule of rules) {
    if (!rule.destinationBucket) {
      return res.status(400).json({ error: 'Each rule requires a destinationBucket' });
    }
  }

  try {
    const sourceRegionInfo = findRegion(region);
    const client = getClientForRegion(region);

    // IONOS only supports the S3 replication XML schema v1: plain `Prefix`
    // on the rule, no `Filter`/`Priority`/`DeleteMarkerReplication` (those
    // are v2-only elements and fail IONOS's schema validation).
    const Rules = rules.map((rule, idx) => ({
      ID: rule.id || `rule-${idx + 1}`,
      Status: rule.status === 'Disabled' ? 'Disabled' : 'Enabled',
      Prefix: rule.prefix || '',
      Destination: {
        Bucket: bucketArn(rule.destinationBucket),
        ...(rule.destinationStorageClass ? { StorageClass: rule.destinationStorageClass } : {}),
      },
    }));

    const command = new PutBucketReplicationCommand({
      Bucket: bucket,
      ReplicationConfiguration: {
        Role: PLACEHOLDER_ROLE,
        Rules,
      },
    });

    // All rules on a bucket must share one destination (IONOS rejects
    // otherwise), so a single lookup tells us whether this is cross-system.
    if (sourceRegionInfo.ownership === 'user') {
      const { buckets: allKnownBuckets } = await listAllBuckets();
      const destBucket = allKnownBuckets.find((b) => b.name === rules[0].destinationBucket);
      if (destBucket?.ownership === 'contract') {
        const destRegionInfo = findRegion(destBucket.region);
        addCsrHeaders(command, {
          endpoint: destRegionInfo.endpoint,
          accessKey: process.env.IONOS_S3_ACCESS_KEY,
          secretKey: process.env.IONOS_S3_SECRET_KEY,
        });
      }
    }

    await client.send(command);

    res.json({ ok: true });
  } catch (err) {
    if (err.Code === 'InvalidRequest' && err.message === 'No endpoint specified') {
      return res.status(502).json({
        error:
          'IONOS rejected this rule with "No endpoint specified" even with the cross-system replication headers ' +
          'attached. This usually means CSR (cross-system replication) hasn\'t been enabled for this contract on ' +
          "IONOS's side yet (cmc_crr_external_enabled on the Cloudian master node) - worth checking with IONOS support.",
      });
    }
    if (err.message?.includes('can only be used within a secure request')) {
      return res.status(502).json({
        error:
          'Cloudian rejected the CRR credentials with "can only be used within a secure request", even though ' +
          "this request used HTTPS end-to-end from our side. Cloudian checks whether its own S3 service directly " +
          'terminated the TLS connection - if IONOS\'s edge/load balancer terminates TLS and forwards internally ' +
          "over plain HTTP, Cloudian sees that hop as insecure regardless of the public endpoint being HTTPS. This " +
          "is an infrastructure-side gap, not something fixable here - worth escalating to IONOS support with this " +
          'exact error.',
      });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/replication', async (req, res) => {
  const { region, bucket } = req.params;
  try {
    findRegion(region);
    const client = getClientForRegion(region);
    await client.send(new DeleteBucketReplicationCommand({ Bucket: bucket }));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
