async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

export const api = {
  getRegions: () => request('/regions'),
  listBuckets: () => request('/buckets'),
  createBucket: (payload) => request('/buckets', { method: 'POST', body: JSON.stringify(payload) }),
  deleteBucket: (region, bucket) => request(`/buckets/${region}/${bucket}`, { method: 'DELETE' }),
  getReplicationOverview: () => request('/replication-overview'),
  getVersioning: (region, bucket) => request(`/buckets/${region}/${bucket}/versioning`),
  getObjectLock: (region, bucket) => request(`/buckets/${region}/${bucket}/object-lock`),
  setVersioning: (region, bucket, status) =>
    request(`/buckets/${region}/${bucket}/versioning`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),
  getReplication: (region, bucket) => request(`/buckets/${region}/${bucket}/replication`),
  setReplication: (region, bucket, rules) =>
    request(`/buckets/${region}/${bucket}/replication`, {
      method: 'PUT',
      body: JSON.stringify({ rules }),
    }),
  deleteReplication: (region, bucket) =>
    request(`/buckets/${region}/${bucket}/replication`, { method: 'DELETE' }),
  uploadEnv: (content) =>
    request('/settings/env', { method: 'POST', body: JSON.stringify({ content }) }),
};
