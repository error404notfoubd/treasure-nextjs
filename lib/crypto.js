import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error('Missing SUPABASE_SECRET_KEY for encryption');
  return createHash('sha256')
    .update(secret + ':field-encryption-key')
    .digest();
}

let _key;
function getKey() {
  if (!_key) _key = deriveKey();
  return _key;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64 string: iv + authTag + ciphertext.
 */
export function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypt a string produced by encrypt().
 */
export function decrypt(ciphertext) {
  if (!ciphertext) return ciphertext;
  const key = getKey();
  const buf = Buffer.from(ciphertext, 'base64');

  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid ciphertext');
  }

  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * One-way hash for lookup (searching encrypted fields).
 * Returns a hex string deterministic for the same input.
 */
export function hashForLookup(value) {
  if (!value) return null;
  return createHash('sha256')
    .update((process.env.SUPABASE_SECRET_KEY || '') + ':lookup-hash:' + value.toLowerCase().trim())
    .digest('hex');
}
