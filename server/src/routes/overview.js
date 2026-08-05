import { Router } from 'express';
import { GetBucketReplicationCommand } from '@aws-sdk/client-s3';
import { listAllBuckets } from '../bucketService.js';
import { getClientForRegion } from '../s3Client.js';

const router = Router();

function isNotFound(err) {
  return (
    err?.name === 'ReplicationConfigurationNotFoundError' ||
    err?.Code === 'ReplicationConfigurationNotFoundError' ||
    err?.$metadata?.httpStatusCode === 404
  );
}

// GET /api/replication-overview
// Scans every user-owned bucket (the only valid replication sources) and
// builds the full set of source -> destination edges across the account,
// so the UI can render a site/bucket replication map.
router.get('/', async (req, res) => {
  const { buckets, regionErrors } = await listAllBuckets();
  const bucketIndex = new Map(buckets.map((b) => [b.name, b]));
  const sourceCandidates = buckets.filter((b) => b.ownership === 'user');

  const edgeLists = await Promise.all(
    sourceCandidates.map(async (bucket) => {
      try {
        const client = getClientForRegion(bucket.region);
        const out = await client.send(new GetBucketReplicationCommand({ Bucket: bucket.name }));
        const rules = out.ReplicationConfiguration?.Rules || [];
        return rules.map((rule) => {
          const destinationName = (rule.Destination?.Bucket || '').replace('arn:aws:s3:::', '');
          const destination = bucketIndex.get(destinationName);
          return {
            source: { name: bucket.name, region: bucket.region },
            destination: {
              name: destinationName,
              region: destination?.region || null,
            },
            status: rule.Status,
            prefix: rule.Filter?.Prefix ?? rule.Prefix ?? '',
          };
        });
      } catch (err) {
        if (isNotFound(err)) return [];
        return [];
      }
    }),
  );

  const edges = edgeLists.flat();

  res.json({ buckets, regionErrors, edges });
});

export default router;
