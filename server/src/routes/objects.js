import express, { Router } from 'express';
import {
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectAclCommand,
  PutObjectAclCommand,
  GetObjectRetentionCommand,
  PutObjectRetentionCommand,
  GetObjectLegalHoldCommand,
  PutObjectLegalHoldCommand,
} from '@aws-sdk/client-s3';
import { getClientForRegion } from '../s3Client.js';
import { findRegion } from '../regions.js';
import { getConfiguredSseKey, parseSseKey } from '../sseKey.js';

const router = Router({ mergeParams: true });

const CONCURRENCY = 5;
const ALL_USERS_URI = 'http://acs.amazonaws.com/groups/global/AllUsers';
const AUTHENTICATED_USERS_URI = 'http://acs.amazonaws.com/groups/global/AuthenticatedUsers';

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

// Verified against real IONOS buckets on both backend types (user-owned and
// contract-owned): GetObject on an SSE-C object without the key returns a
// proper 400 "InvalidRequest" with a descriptive message, matched below. But
// HeadObject (used for listing) returns a bare, unlabeled 400 with no error
// body at all - S3 HEAD responses can't carry one - so a plain HeadObject
// 400 is the only signal available there, and status alone has to do; a 404
// (missing key) always comes back distinctly as "NotFound".
function looksLikeSseCRequired(err) {
  return err?.$metadata?.httpStatusCode === 400;
}

// GET /api/buckets/:region/:bucket/objects - list objects, flagging which
// ones require an SSE-C key to read.
router.get('/', async (req, res) => {
  const { region, bucket } = req.params;
  const { prefix, continuationToken } = req.query;
  try {
    findRegion(region);
    const client = getClientForRegion(region);
    const listOut = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        ContinuationToken: continuationToken || undefined,
        MaxKeys: 200,
      }),
    );
    const items = listOut.Contents || [];

    const objects = await mapWithConcurrency(items, CONCURRENCY, async (item) => {
      const base = { key: item.Key, size: item.Size, lastModified: item.LastModified };
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: item.Key }));
        return { ...base, encrypted: false, serverManaged: !!head.ServerSideEncryption, contentType: head.ContentType || null };
      } catch (err) {
        if (looksLikeSseCRequired(err)) {
          return { ...base, encrypted: true, serverManaged: false, contentType: null };
        }
        return { ...base, encrypted: null, serverManaged: false, contentType: null, error: err.message };
      }
    });

    res.json({
      objects,
      isTruncated: !!listOut.IsTruncated,
      nextContinuationToken: listOut.NextContinuationToken || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/buckets/:region/:bucket/objects/versions?key=...
router.get('/versions', async (req, res) => {
  const { region, bucket } = req.params;
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'Missing object key' });

  try {
    findRegion(region);
    const client = getClientForRegion(region);
    const out = await client.send(
      new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key, MaxKeys: 500 }),
    );

    const versions = (out.Versions || [])
      .filter((v) => v.Key === key)
      .map((v) => ({
        versionId: v.VersionId,
        isLatest: !!v.IsLatest,
        size: v.Size,
        lastModified: v.LastModified,
        type: 'version',
      }));
    const deleteMarkers = (out.DeleteMarkers || [])
      .filter((v) => v.Key === key)
      .map((v) => ({
        versionId: v.VersionId,
        isLatest: !!v.IsLatest,
        size: null,
        lastModified: v.LastModified,
        type: 'delete-marker',
      }));

    const combined = [...versions, ...deleteMarkers].sort(
      (a, b) => new Date(b.lastModified) - new Date(a.lastModified),
    );
    res.json({ versions: combined });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/buckets/:region/:bucket/objects/acl?key=...
router.get('/acl', async (req, res) => {
  const { region, bucket } = req.params;
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'Missing object key' });

  try {
    findRegion(region);
    const client = getClientForRegion(region);
    const out = await client.send(new GetObjectAclCommand({ Bucket: bucket, Key: key }));
    const grants = out.Grants || [];

    function permsFor(matches) {
      const matched = grants.filter(matches);
      return {
        read: matched.some((g) => g.Permission === 'READ' || g.Permission === 'FULL_CONTROL'),
        readAcp: matched.some((g) => g.Permission === 'READ_ACP' || g.Permission === 'FULL_CONTROL'),
        writeAcp: matched.some((g) => g.Permission === 'WRITE_ACP' || g.Permission === 'FULL_CONTROL'),
      };
    }

    const isPublic = (g) => g.Grantee?.Type === 'Group' && g.Grantee?.URI === ALL_USERS_URI;
    const isAuthenticated = (g) => g.Grantee?.Type === 'Group' && g.Grantee?.URI === AUTHENTICATED_USERS_URI;
    const isCustomUser = (g) => g.Grantee?.Type === 'CanonicalUser' && g.Grantee?.ID !== out.Owner?.ID;

    const customIds = [...new Set(grants.filter(isCustomUser).map((g) => g.Grantee.ID))];
    const grantees = customIds.map((id) => ({
      id,
      displayName: grants.find((g) => g.Grantee.ID === id)?.Grantee?.DisplayName || null,
      ...permsFor((g) => isCustomUser(g) && g.Grantee.ID === id),
    }));

    res.json({
      owner: out.Owner ? { id: out.Owner.ID, displayName: out.Owner.DisplayName } : null,
      public: permsFor(isPublic),
      authenticated: permsFor(isAuthenticated),
      grantees,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/buckets/:region/:bucket/objects/acl?key=...
// Body: { public: {read,readAcp,writeAcp}, authenticated: {...}, grantees: [{id,read,readAcp,writeAcp}] }
router.put('/acl', async (req, res) => {
  const { region, bucket } = req.params;
  const { key } = req.query;
  const { public: pub, authenticated, grantees } = req.body || {};
  if (!key) return res.status(400).json({ error: 'Missing object key' });

  try {
    findRegion(region);
    const client = getClientForRegion(region);

    // PutObjectAcl replaces the whole ACL, so the owner grant (always full
    // control, not user-editable here) has to be re-sent every time.
    const current = await client.send(new GetObjectAclCommand({ Bucket: bucket, Key: key }));
    const owner = current.Owner;
    if (!owner) return res.status(500).json({ error: "Could not resolve this object's owner for the ACL update." });

    const grants = [{ Grantee: { Type: 'CanonicalUser', ID: owner.ID }, Permission: 'FULL_CONTROL' }];

    function addGroupGrants(uri, perms) {
      if (!perms) return;
      if (perms.read) grants.push({ Grantee: { Type: 'Group', URI: uri }, Permission: 'READ' });
      if (perms.readAcp) grants.push({ Grantee: { Type: 'Group', URI: uri }, Permission: 'READ_ACP' });
      if (perms.writeAcp) grants.push({ Grantee: { Type: 'Group', URI: uri }, Permission: 'WRITE_ACP' });
    }
    addGroupGrants(ALL_USERS_URI, pub);
    addGroupGrants(AUTHENTICATED_USERS_URI, authenticated);

    for (const g of grantees || []) {
      if (!g?.id) continue;
      if (g.read) grants.push({ Grantee: { Type: 'CanonicalUser', ID: g.id }, Permission: 'READ' });
      if (g.readAcp) grants.push({ Grantee: { Type: 'CanonicalUser', ID: g.id }, Permission: 'READ_ACP' });
      if (g.writeAcp) grants.push({ Grantee: { Type: 'CanonicalUser', ID: g.id }, Permission: 'WRITE_ACP' });
    }

    await client.send(
      new PutObjectAclCommand({ Bucket: bucket, Key: key, AccessControlPolicy: { Owner: owner, Grants: grants } }),
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/buckets/:region/:bucket/objects/lock?key=...
// Per-object retention + legal hold - only meaningful on buckets created
// with Object Lock enabled.
router.get('/lock', async (req, res) => {
  const { region, bucket } = req.params;
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'Missing object key' });

  try {
    findRegion(region);
    const client = getClientForRegion(region);

    let retention = null;
    try {
      const r = await client.send(new GetObjectRetentionCommand({ Bucket: bucket, Key: key }));
      retention = { mode: r.Retention?.Mode || null, retainUntilDate: r.Retention?.RetainUntilDate || null };
    } catch (err) {
      if (err?.$metadata?.httpStatusCode !== 404) throw err;
    }

    let legalHold = 'OFF';
    try {
      const l = await client.send(new GetObjectLegalHoldCommand({ Bucket: bucket, Key: key }));
      legalHold = l.LegalHold?.Status || 'OFF';
    } catch (err) {
      if (err?.$metadata?.httpStatusCode !== 404) throw err;
    }

    res.json({ retention, legalHold });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/buckets/:region/:bucket/objects/lock/retention?key=...
// Body: { mode: 'GOVERNANCE'|'COMPLIANCE', retainUntilDate, bypassGovernance? }
router.put('/lock/retention', async (req, res) => {
  const { region, bucket } = req.params;
  const { key } = req.query;
  const { mode, retainUntilDate, bypassGovernance } = req.body || {};
  if (!key) return res.status(400).json({ error: 'Missing object key' });
  if (!['GOVERNANCE', 'COMPLIANCE'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be GOVERNANCE or COMPLIANCE' });
  }
  if (!retainUntilDate) return res.status(400).json({ error: 'retainUntilDate is required' });

  try {
    findRegion(region);
    const client = getClientForRegion(region);
    await client.send(
      new PutObjectRetentionCommand({
        Bucket: bucket,
        Key: key,
        Retention: { Mode: mode, RetainUntilDate: new Date(retainUntilDate) },
        BypassGovernanceRetention: !!bypassGovernance,
      }),
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/buckets/:region/:bucket/objects/lock/legal-hold?key=...
// Body: { status: 'ON'|'OFF' }
router.put('/lock/legal-hold', async (req, res) => {
  const { region, bucket } = req.params;
  const { key } = req.query;
  const { status } = req.body || {};
  if (!key) return res.status(400).json({ error: 'Missing object key' });
  if (!['ON', 'OFF'].includes(status)) return res.status(400).json({ error: 'status must be ON or OFF' });

  try {
    findRegion(region);
    const client = getClientForRegion(region);
    await client.send(new PutObjectLegalHoldCommand({ Bucket: bucket, Key: key, LegalHold: { Status: status } }));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/buckets/:region/:bucket/objects?key=...
router.delete('/', async (req, res) => {
  const { region, bucket } = req.params;
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'Missing object key' });

  try {
    findRegion(region);
    const client = getClientForRegion(region);
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/buckets/:region/:bucket/objects/download
// Body: { key, sseKey? } - sseKey (base64) overrides the server-configured
// key for this one request without persisting it.
//
// Always tries a plain GetObject first. Sending SSE-C headers on an object
// that *isn't* SSE-C encrypted makes S3 reject the request with the same
// bare 400 used to detect "key required" - so unconditionally attaching a
// configured key to every download broke plain downloads. Only retry with a
// key once the plain attempt actually signals one is needed.
router.post('/download', async (req, res) => {
  const { region, bucket } = req.params;
  const { key, sseKey } = req.body || {};
  if (!key) return res.status(400).json({ error: 'Missing object key' });

  try {
    findRegion(region);
    const client = getClientForRegion(region);

    function get(sseBuffer) {
      const params = { Bucket: bucket, Key: key };
      if (sseBuffer) {
        params.SSECustomerAlgorithm = 'AES256';
        params.SSECustomerKey = sseBuffer;
      }
      return client.send(new GetObjectCommand(params));
    }

    let out;
    try {
      out = await get(null);
    } catch (err) {
      if (!looksLikeSseCRequired(err)) throw err;

      const keyToUse = sseKey || getConfiguredSseKey();
      if (!keyToUse) {
        return res.status(400).json({
          error: 'This object is SSE-C encrypted. Provide the correct encryption key to download it.',
        });
      }
      let sseBuffer;
      try {
        sseBuffer = parseSseKey(keyToUse);
      } catch (parseErr) {
        return res.status(400).json({ error: parseErr.message });
      }
      out = await get(sseBuffer);
    }

    const filename = (key.split('/').pop() || key).replace(/["\r\n]/g, '_');
    res.setHeader('Content-Type', out.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    if (out.ContentLength) res.setHeader('Content-Length', out.ContentLength);

    out.Body.on('error', () => res.destroy());
    out.Body.pipe(res);
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 403) {
      return res.status(403).json({ error: 'Access denied - the encryption key is missing or incorrect for this object.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/buckets/:region/:bucket/objects?key=...&encrypt=true|false
// Body: raw file bytes. Objects can only be SSE-C encrypted at upload time -
// there's no operation to encrypt an existing object in place.
router.put('/', express.raw({ type: () => true, limit: '200mb' }), async (req, res) => {
  const { region, bucket } = req.params;
  const { key } = req.query;
  const encrypt = req.query.encrypt === 'true';

  if (!key) return res.status(400).json({ error: 'Missing object key' });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'No file content received' });
  }

  try {
    findRegion(region);
    const client = getClientForRegion(region);

    const params = { Bucket: bucket, Key: key, Body: req.body };
    const contentType = req.get('X-Content-Type');
    if (contentType) params.ContentType = contentType;

    if (encrypt) {
      const keyToUse = getConfiguredSseKey();
      if (!keyToUse) {
        return res.status(400).json({ error: 'No SSE-C key configured. Upload an encryption key first.' });
      }
      params.SSECustomerAlgorithm = 'AES256';
      params.SSECustomerKey = parseSseKey(keyToUse);
    }

    await client.send(new PutObjectCommand(params));
    res.json({ ok: true, key, encrypted: encrypt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
