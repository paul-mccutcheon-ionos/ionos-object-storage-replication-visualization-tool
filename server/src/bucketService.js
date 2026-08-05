import { ListBucketsCommand, GetBucketLocationCommand } from '@aws-sdk/client-s3';
import { REGIONS } from './regions.js';
import { getClientForRegion } from './s3Client.js';

// IONOS's ListBuckets is shared across every endpoint within an ownership
// class (user-owned vs. contract-owned) - hitting any of the three
// user-owned endpoints returns the identical full bucket list. So we only
// need one "primary" endpoint per ownership class to enumerate buckets, and
// GetBucketLocation (also answerable from that same primary endpoint,
// without redirects) to resolve each bucket's true home region.
const OWNERSHIP_PRIMARY = {
  user: REGIONS.find((r) => r.ownership === 'user').code,
  contract: REGIONS.find((r) => r.ownership === 'contract').code,
};

function resolveRegionCode(ownership, locationConstraint) {
  const primaryCode = OWNERSHIP_PRIMARY[ownership];
  if (!locationConstraint) return primaryCode; // empty = the primary/default region
  const match = REGIONS.find((r) => r.ownership === ownership && r.code === locationConstraint);
  return match ? match.code : locationConstraint;
}

export async function listAllBuckets() {
  const groupResults = await Promise.all(
    Object.entries(OWNERSHIP_PRIMARY).map(async ([ownership, primaryCode]) => {
      try {
        const client = getClientForRegion(primaryCode);
        const listOut = await client.send(new ListBucketsCommand({}));
        const names = listOut.Buckets || [];

        const buckets = await Promise.all(
          names.map(async (b) => {
            try {
              const locOut = await client.send(new GetBucketLocationCommand({ Bucket: b.Name }));
              return {
                name: b.Name,
                creationDate: b.CreationDate,
                region: resolveRegionCode(ownership, locOut.LocationConstraint),
                ownership,
              };
            } catch {
              return { name: b.Name, creationDate: b.CreationDate, region: primaryCode, ownership };
            }
          }),
        );

        return { ownership, buckets, error: null };
      } catch (err) {
        return { ownership, buckets: [], error: err.message };
      }
    }),
  );

  const buckets = groupResults.flatMap((g) => g.buckets);
  const regionErrors = groupResults
    .filter((g) => g.error)
    .map((g) => ({ region: OWNERSHIP_PRIMARY[g.ownership], error: g.error }));

  return { buckets, regionErrors };
}
