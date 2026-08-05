import { S3Client } from '@aws-sdk/client-s3';
import { REGIONS } from './regions.js';

const clients = new Map();

export function resetClients() {
  clients.clear();
}

export function getClientForRegion(regionCode) {
  if (clients.has(regionCode)) {
    return clients.get(regionCode);
  }

  const region = REGIONS.find((r) => r.code === regionCode);
  if (!region) {
    throw new Error(`Unknown region code: ${regionCode}`);
  }

  const client = new S3Client({
    endpoint: region.endpoint,
    region: regionCode,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.IONOS_S3_ACCESS_KEY,
      secretAccessKey: process.env.IONOS_S3_SECRET_KEY,
    },
  });

  clients.set(regionCode, client);
  return client;
}
