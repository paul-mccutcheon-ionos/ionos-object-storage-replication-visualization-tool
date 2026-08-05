// IONOS Object Storage regions.
// https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/endpoints
// Country/city and ordering match the "Bucket region" picker in DCD
// (Data Center Designer) exactly.
//
// Replication rules (as of 2026):
// - Only user-owned buckets can be a replication SOURCE.
// - A user-owned bucket can replicate to another user-owned bucket, or to a
//   contract-owned bucket.
// - Contract-owned buckets cannot currently be a replication source.
export const REGIONS = [
  {
    code: 'de',
    endpoint: 'https://s3.eu-central-1.ionoscloud.com',
    ownership: 'user',
    country: 'DE',
    countryName: 'Germany',
    city: 'Frankfurt',
  },
  {
    code: 'eu-central-2',
    endpoint: 'https://s3.eu-central-2.ionoscloud.com',
    ownership: 'user',
    country: 'DE',
    countryName: 'Germany',
    city: 'Berlin',
  },
  {
    code: 'eu-south-2',
    endpoint: 'https://s3.eu-south-2.ionoscloud.com',
    ownership: 'user',
    country: 'ES',
    countryName: 'Spain',
    city: 'Logroño',
  },
  {
    code: 'eu-central-3',
    endpoint: 'https://s3.eu-central-3.ionoscloud.com',
    ownership: 'contract',
    country: 'DE',
    countryName: 'Germany',
    city: 'Berlin',
  },
  {
    code: 'eu-central-4',
    endpoint: 'https://s3.eu-central-4.ionoscloud.com',
    ownership: 'contract',
    country: 'DE',
    countryName: 'Germany',
    city: 'Frankfurt',
  },
  {
    code: 'us-central-1',
    endpoint: 'https://s3.us-central-1.ionoscloud.com',
    ownership: 'contract',
    country: 'US',
    countryName: 'USA',
    city: 'Lenexa',
  },
];

export function findRegion(code) {
  const region = REGIONS.find((r) => r.code === code);
  if (!region) {
    throw new Error(`Unknown region code: ${code}`);
  }
  return region;
}
