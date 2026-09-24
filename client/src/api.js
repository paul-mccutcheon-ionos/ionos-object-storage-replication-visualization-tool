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
  setObjectLock: (region, bucket, payload) =>
    request(`/buckets/${region}/${bucket}/object-lock`, { method: 'PUT', body: JSON.stringify(payload) }),
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

  getSseKeyStatus: () => request('/settings/sse-key/status'),
  uploadSseKey: (content) =>
    request('/settings/sse-key', { method: 'POST', body: JSON.stringify({ content }) }),
  clearSseKey: () => request('/settings/sse-key', { method: 'DELETE' }),

  listObjects: (region, bucket, { prefix, continuationToken } = {}) => {
    const params = new URLSearchParams();
    if (prefix) params.set('prefix', prefix);
    if (continuationToken) params.set('continuationToken', continuationToken);
    const qs = params.toString();
    return request(`/buckets/${region}/${bucket}/objects${qs ? `?${qs}` : ''}`);
  },

  downloadObject: async (region, bucket, key, sseKey) => {
    const res = await fetch(`/api/buckets/${region}/${bucket}/objects/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, sseKey: sseKey || undefined }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Download failed: ${res.status}`);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition) || /filename="([^"]+)"/i.exec(disposition);
    const filename = match ? decodeURIComponent(match[1]) : key.split('/').pop() || key;
    return { blob, filename };
  },

  uploadObject: async (region, bucket, key, file, encrypt) => {
    const params = new URLSearchParams({ key, encrypt: String(!!encrypt) });
    const res = await fetch(`/api/buckets/${region}/${bucket}/objects?${params.toString()}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Upload failed: ${res.status}`);
    return data;
  },

  deleteObject: (region, bucket, key) => {
    const params = new URLSearchParams({ key });
    return request(`/buckets/${region}/${bucket}/objects?${params.toString()}`, { method: 'DELETE' });
  },

  getObjectVersions: (region, bucket, key) => {
    const params = new URLSearchParams({ key });
    return request(`/buckets/${region}/${bucket}/objects/versions?${params.toString()}`);
  },

  getObjectAcl: (region, bucket, key) => {
    const params = new URLSearchParams({ key });
    return request(`/buckets/${region}/${bucket}/objects/acl?${params.toString()}`);
  },
  setObjectAcl: (region, bucket, key, acl) => {
    const params = new URLSearchParams({ key });
    return request(`/buckets/${region}/${bucket}/objects/acl?${params.toString()}`, {
      method: 'PUT',
      body: JSON.stringify(acl),
    });
  },

  getObjectRetentionLock: (region, bucket, key) => {
    const params = new URLSearchParams({ key });
    return request(`/buckets/${region}/${bucket}/objects/lock?${params.toString()}`);
  },
  setObjectRetention: (region, bucket, key, payload) => {
    const params = new URLSearchParams({ key });
    return request(`/buckets/${region}/${bucket}/objects/lock/retention?${params.toString()}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  setObjectLegalHold: (region, bucket, key, status) => {
    const params = new URLSearchParams({ key });
    return request(`/buckets/${region}/${bucket}/objects/lock/legal-hold?${params.toString()}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  },
};
