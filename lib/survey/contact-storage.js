import { encrypt, decrypt, hashForLookup } from '@/lib/crypto';

/** Stable lookup key for a normalized E.164 phone (same algorithm as email hash). */
export function phoneHash(e164) {
  if (!e164 || typeof e164 !== 'string') return null;
  return hashForLookup(e164.trim());
}

export function emailHash(emailPlain) {
  if (!emailPlain || typeof emailPlain !== 'string') return null;
  return hashForLookup(emailPlain.trim().toLowerCase());
}

export function persistPhone(e164) {
  return { phone: encrypt(e164), phone_hash: phoneHash(e164) };
}

export function persistEmail(emailPlainOrNull) {
  if (emailPlainOrNull == null || !String(emailPlainOrNull).trim()) {
    return { email: null, email_hash: null };
  }
  const lower = String(emailPlainOrNull).trim().toLowerCase();
  return { email: encrypt(lower), email_hash: emailHash(lower) };
}

function looksLikeLegacyPlainPhone(s) {
  return typeof s === 'string' && s.startsWith('+') && s.length <= 22 && !/=/.test(s);
}

function looksLikeLegacyPlainEmail(s) {
  return (
    typeof s === 'string' &&
    s.length < 300 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
  );
}

/** Decrypt stored phone or accept legacy plaintext rows. */
export function resolvePhoneFromDb(stored) {
  if (!stored || typeof stored !== 'string') return null;
  try {
    return decrypt(stored);
  } catch {
    return looksLikeLegacyPlainPhone(stored) ? stored : null;
  }
}

/** Decrypt stored email or accept legacy plaintext rows. */
export function resolveEmailFromDb(stored) {
  if (!stored || typeof stored !== 'string') return null;
  try {
    return decrypt(stored);
  } catch {
    return looksLikeLegacyPlainEmail(stored) ? stored : null;
  }
}
