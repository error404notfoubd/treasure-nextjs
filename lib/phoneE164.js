/**
 * Normalize user-entered phone to E.164 for Prelude and storage.
 * Accepts explicit +prefix, or 10-digit US, or 11-digit starting with 1.
 */
export function toE164(phone) {
  if (typeof phone !== 'string') return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (!digitsOnly) return null;

  let e164;
  if (trimmed.startsWith('+')) {
    e164 = `+${digitsOnly}`;
  } else if (digitsOnly.length === 10) {
    e164 = `+1${digitsOnly}`;
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    e164 = `+${digitsOnly}`;
  } else {
    return null;
  }

  // E.164: + and up to 15 digits (ITU-T E.164)
  const d = e164.slice(1);
  if (d.length < 8 || d.length > 15) return null;
  return e164;
}
