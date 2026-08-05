import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { resetClients } from '../s3Client.js';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');
const ENV_EXAMPLE_PATH = path.join(PROJECT_ROOT, '.env.example');

// Only these keys are ever written to disk - the uploaded file's content is
// parsed and re-serialized, never written through verbatim.
const ALLOWED_KEYS = ['IONOS_S3_ACCESS_KEY', 'IONOS_S3_SECRET_KEY', 'PORT'];

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

  const sanitized = {};
  for (const key of ALLOWED_KEYS) {
    if (parsed[key]) sanitized[key] = parsed[key];
  }

  const serialized = Object.entries(sanitized)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  fs.writeFileSync(ENV_PATH, `${serialized}\n`, 'utf8');

  Object.assign(process.env, sanitized);
  resetClients();

  res.json({ ok: true, keys: Object.keys(sanitized) });
});

export default router;
