import { createHmac, createHash, timingSafeEqual } from 'crypto';

/**
 * Derive a stable HMAC key from SUPABASE_SECRET_KEY so we don't need
 * another env var. The salt ensures this key is only valid for survey tokens.
 */
const HMAC_KEY = createHash('sha256')
  .update((process.env.SUPABASE_SECRET_KEY || '') + ':survey-verification-token')
  .digest();

/** Default: 365 days (ms). Override with SURVEY_TOKEN_MAX_AGE_MS. */
const DEFAULT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 10 * 60 * 1000;

export function maxTokenAgeMs() {
  const n = parseInt(process.env.SURVEY_TOKEN_MAX_AGE_MS || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_AGE_MS;
}

/**
 * Create a signed token: "<userId uuid>.<timestamp>.<signature>"
 * The signature covers both the ID and the timestamp so neither can be altered.
 */
export function createVerificationToken(userId) {
  const id = String(userId);
  const ts = Date.now().toString(36);
  const payload = `${id}.${ts}`;
  const sig = createHmac('sha256', HMAC_KEY).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/**
 * Verify and parse a token. Returns { valid, surveyResponseId } (UUID) or { valid: false }.
 * Replays are limited by timestamp expiry (see SURVEY_TOKEN_MAX_AGE_MS).
 */
export function verifyToken(token) {
  if (typeof token !== 'string') return { valid: false };

  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false };

  const [id, ts, sig] = parts;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) return { valid: false };

  const payload = `${id}.${ts}`;
  const expected = createHmac('sha256', HMAC_KEY).update(payload).digest('hex');

  if (sig.length !== expected.length) return { valid: false };

  const sigBuf = Buffer.from(sig, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return { valid: false };

  if (!timingSafeEqual(sigBuf, expBuf)) return { valid: false };

  const tsMs = parseInt(ts, 36);
  if (!Number.isFinite(tsMs) || tsMs < 0) return { valid: false };

  const now = Date.now();
  if (tsMs > now + FUTURE_SKEW_MS) return { valid: false };
  if (now - tsMs > maxTokenAgeMs()) return { valid: false };

  return { valid: true, surveyResponseId: id };
}
