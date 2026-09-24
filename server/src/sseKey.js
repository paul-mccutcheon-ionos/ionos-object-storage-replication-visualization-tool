import crypto from 'node:crypto';

// SSE-C uses a single symmetric AES-256 secret (not a public/private key
// pair) - the same 32-byte key is supplied on every PutObject/GetObject
// request for that object, and IONOS never stores or returns it.
const KEY_BYTES = 32;

export function parseSseKey(base64Key) {
  let buf;
  try {
    buf = Buffer.from(base64Key, 'base64');
  } catch {
    throw new Error('Encryption key is not valid base64.');
  }
  if (buf.length !== KEY_BYTES) {
    throw new Error(`Encryption key must decode to exactly ${KEY_BYTES} bytes (got ${buf.length}).`);
  }
  return buf;
}

export function getConfiguredSseKey() {
  return process.env.IONOS_SSE_C_KEY || null;
}

export function sseKeyFingerprint(base64Key) {
  return crypto.createHash('md5').update(parseSseKey(base64Key)).digest('hex').slice(0, 8);
}
