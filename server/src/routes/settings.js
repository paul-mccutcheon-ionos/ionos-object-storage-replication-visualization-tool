import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { resetClients } from '../s3Client.js';
import { parseSseKey, getConfiguredSseKey, sseKeyFingerprint } from '../sseKey.js';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');
const ENV_EXAMPLE_PATH = path.join(PROJECT_ROOT, '.env.example');

// Only these keys are ever written to disk - the uploaded file's content is
// parsed and re-serialized, never written through verbatim.
const ALLOWED_KEYS = ['IONOS_S3_ACCESS_KEY', 'IONOS_S3_SECRET_KEY', 'IONOS_SSE_C_KEY', 'PORT'];

function readExistingEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  return dotenv.parse(fs.readFileSync(ENV_PATH, 'utf8'));
}

// Merges `updates` on top of whatever's already on disk (falling back to the
// current process env for keys the file doesn't have) instead of replacing
// the file outright - otherwise uploading just the SSE-C key would wipe out
// the S3 credentials, and vice versa.
function mergeAndWriteEnv(updates) {
  const existing = readExistingEnv();
  const sanitized = {};
  for (const key of ALLOWED_KEYS) {
    const value = updates[key] ?? existing[key] ?? process.env[key];
    if (value) sanitized[key] = value;
  }

  const serialized = Object.entries(sanitized)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  fs.writeFileSync(ENV_PATH, `${serialized}\n`, 'utf8');
  Object.assign(process.env, sanitized);
  return sanitized;
}

router.get('/env-example', (req, res) => {
  if (!fs.existsSync(ENV_EXAMPLE_PATH)) {
    return res.status(404).json({ error: '.env.example not found' });
  }
  res.download(ENV_EXAMPLE_PATH, '.env.example', { dotfiles: 'allow' });
});

router.post('/env', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'No .env content provided' });
  }

  const parsed = dotenv.parse(content);

  if (!parsed.IONOS_S3_ACCESS_KEY || !parsed.IONOS_S3_SECRET_KEY) {
    return res.status(400).json({
      error: 'Uploaded file must include IONOS_S3_ACCESS_KEY and IONOS_S3_SECRET_KEY',
    });
  }

  if (parsed.IONOS_SSE_C_KEY) {
    try {
      parseSseKey(parsed.IONOS_SSE_C_KEY);
    } catch (err) {
      return res.status(400).json({ error: `IONOS_SSE_C_KEY: ${err.message}` });
    }
  }

  const updates = {};
  for (const key of ALLOWED_KEYS) {
    if (parsed[key]) updates[key] = parsed[key];
  }

  const sanitized = mergeAndWriteEnv(updates);
  resetClients();

  res.json({ ok: true, keys: Object.keys(sanitized) });
});

// SSE-C encryption key - a separate upload/download flow from the main S3
// credentials, since it's optional and a user may want to configure (or
// clear) it independently.
router.get('/sse-key/status', (req, res) => {
  const key = getConfiguredSseKey();
  if (!key) return res.json({ configured: false, fingerprint: null });
  try {
    res.json({ configured: true, fingerprint: sseKeyFingerprint(key) });
  } catch {
    res.json({ configured: false, fingerprint: null });
  }
});

router.post('/sse-key', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'No .env content provided' });
  }

  const parsed = dotenv.parse(content);
  if (!parsed.IONOS_SSE_C_KEY) {
    return res.status(400).json({ error: 'Uploaded file must include IONOS_SSE_C_KEY' });
  }

  let fingerprint;
  try {
    fingerprint = sseKeyFingerprint(parsed.IONOS_SSE_C_KEY);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  mergeAndWriteEnv({ IONOS_SSE_C_KEY: parsed.IONOS_SSE_C_KEY });
  res.json({ ok: true, fingerprint });
});

router.delete('/sse-key', (req, res) => {
  const existing = readExistingEnv();
  delete existing.IONOS_SSE_C_KEY;
  delete process.env.IONOS_SSE_C_KEY;

  const sanitized = {};
  for (const key of ALLOWED_KEYS) {
    if (key === 'IONOS_SSE_C_KEY') continue;
    const value = existing[key] ?? process.env[key];
    if (value) sanitized[key] = value;
  }
  const serialized = Object.entries(sanitized)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  fs.writeFileSync(ENV_PATH, `${serialized}\n`, 'utf8');

  res.json({ ok: true });
});

export default router;
