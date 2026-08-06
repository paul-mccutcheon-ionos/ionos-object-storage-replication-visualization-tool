import { Router } from 'express';
import { GetBucketReplicationCommand } from '@aws-sdk/client-s3';
import { listAllBuckets } from '../bucketService.js';
import { getClientForRegion } from '../s3Client.js';

const router = Router();

const CONCURRENCY = 5;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 400;

function isNotFound(err) {
  return (
    err?.name === 'ReplicationConfigurationNotFoundError' ||
    err?.Code === 'ReplicationConfigurationNotFoundError' ||
    err?.$metadata?.httpStatusCode === 404
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Querying GetBucketReplication for every user-owned bucket concurrently can
// trip IONOS's rate limiting, which surfaced as replication rules randomly
// missing from the overview with no indication anything had gone wrong.
// Retry transient failures a couple of times, and cap how many requests are
// in flight at once instead of firing them all in a single Promise.all.
async function getReplicationWithRetry(bucket) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const client = getClientForRegion(bucket.region);
      const out = await client.send(new GetBucketReplicationCommand({ Bucket: bucket.name }));
      return out.ReplicationConfiguration?.Rules || [];
    } catch (err) {
      if (isNotFound(err)) return [];
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastErr;
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// GET /api/replication-overview
// Scans every user-owned bucket (the only valid replication sources) and
// builds the full set of source -> destination edges across the account,
// so the UI can render a site/bucket replication map.
router.get('/', async (req, res) => {
  const { buckets, regionErrors } = await listAllBuckets();
  const bucketIndex = new Map(buckets.map((b) => [b.name, b]));
  const sourceCandidates = buckets.filter((b) => b.ownership === 'user');

  const bucketErrors = [];

  const edgeLists = await mapWithConcurrency(sourceCandidates, CONCURRENCY, async (bucket) => {
    try {
      const rules = await getReplicationWithRetry(bucket);
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
      console.error(`Failed to read replication config for bucket "${bucket.name}":`, err.message);
      bucketErrors.push({ bucket: bucket.name, error: err.message });
      return [];
    }
  });

  const edges = edgeLists.flat();

  res.json({ buckets, regionErrors, bucketErrors, edges });
});

export default router;
