import { Router } from 'express';
import { CreateBucketCommand, PutObjectLockConfigurationCommand } from '@aws-sdk/client-s3';
import { REGIONS, findRegion } from '../regions.js';
import { listAllBuckets } from '../bucketService.js';
import { getClientForRegion } from '../s3Client.js';

const router = Router();

const BUCKET_NAME_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

// GET /api/buckets - aggregate ListBuckets across every known IONOS region.
router.get('/', async (req, res) => {
  const { buckets, regionErrors } = await listAllBuckets();
  res.json({ buckets, regions: REGIONS, regionErrors });
});

// POST /api/buckets - create a bucket, optionally with Object Lock enabled.
router.post('/', async (req, res) => {
  const { name, region, objectLock } = req.body;

  if (!name || !BUCKET_NAME_RE.test(name)) {
    return res.status(400).json({
      error: 'Bucket name must be 3-63 characters: lowercase letters, digits, hyphens or dots.',
    });
  }

  let regionInfo;
  try {
    regionInfo = findRegion(region);
  } catch {
    return res.status(400).json({ error: `Unknown region "${region}"` });
  }

  const lockEnabled = !!objectLock?.enabled;
  const lockMode = objectLock?.mode; // 'none' | 'GOVERNANCE' | 'COMPLIANCE'
  const retentionValue = Number(objectLock?.retentionValue);
  const retentionUnit = objectLock?.retentionUnit; // 'Days' | 'Years'

  if (lockEnabled && lockMode !== 'none') {
    if (!Number.isFinite(retentionValue) || retentionValue <= 0) {
      return res.status(400).json({ error: 'Retention period must be a positive number.' });
    }
    if (!['Days', 'Years'].includes(retentionUnit)) {
      return res.status(400).json({ error: 'Retention unit must be "Days" or "Years".' });
    }
  }

  try {
    const client = getClientForRegion(region);

    await client.send(
      new CreateBucketCommand({
        Bucket: name,
        ...(lockEnabled ? { ObjectLockEnabledForBucket: true } : {}),
      }),
    );

    // Object Lock at creation always enables versioning automatically - a
    // default retention rule is a separate, optional follow-up call.
    if (lockEnabled && lockMode && lockMode !== 'none') {
      await client.send(
        new PutObjectLockConfigurationCommand({
          Bucket: name,
          ObjectLockConfiguration: {
            ObjectLockEnabled: 'Enabled',
            Rule: {
              DefaultRetention: {
                Mode: lockMode,
                ...(retentionUnit === 'Years' ? { Years: retentionValue } : { Days: retentionValue }),
              },
            },
          },
        }),
      );
    }

    res.json({ ok: true, bucket: { name, region: regionInfo.code, ownership: regionInfo.ownership } });
  } catch (err) {
    // The SDK's own .message is frequently just "UnknownError" for this API
    // (the real reason lands in .Code/.name instead), so prefer those.
    if (err.Code === 'BucketAlreadyExists' || err.Code === 'BucketAlreadyOwnedByYou') {
      return res.status(409).json({
        error: `A bucket named "${name}" already exists. Bucket names must be unique across all IONOS Object Storage regions - try a different name.`,
      });
    }
    const detail = err.Code && err.Code !== err.message ? `${err.Code}: ${err.message}` : err.message;
    res.status(500).json({ error: detail });
  }
});

export default router;
