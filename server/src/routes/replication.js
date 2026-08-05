import { Router } from 'express';
import {
  GetBucketVersioningCommand,
  PutBucketVersioningCommand,
  GetBucketReplicationCommand,
  PutBucketReplicationCommand,
  DeleteBucketReplicationCommand,
} from '@aws-sdk/client-s3';
import { getClientForRegion } from '../s3Client.js';
import { findRegion } from '../regions.js';

const router = Router({ mergeParams: true });

// IONOS ignores the IAM Role field on replication configs (no AWS-style IAM
// roles), but the S3 API schema still requires the element to be present.
const PLACEHOLDER_ROLE = 'arn:aws:iam::000000000000:role/not-used-by-ionos';

function bucketArn(bucketName) {
  return `arn:aws:s3:::${bucketName}`;
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
    findRegion(region);
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

    await client.send(
      new PutBucketReplicationCommand({
        Bucket: bucket,
        ReplicationConfiguration: {
          Role: PLACEHOLDER_ROLE,
          Rules,
        },
      }),
    );

    res.json({ ok: true });
  } catch (err) {
    if (err.Code === 'InvalidRequest' && err.message === 'No endpoint specified') {
      return res.status(502).json({
        error:
          "IONOS rejected this rule with \"No endpoint specified\". This happens when the source and destination bucket are in different ownership classes (user-owned vs. contract-owned) in different regions - this specific combination isn't supported by IONOS's public replication API yet. Try a destination bucket in the same ownership class, or set up this pairing via the DCD console instead.",
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
