import GAME_CONFIG from '@/lib/controls';

export const VALID_FREQUENCIES = GAME_CONFIG.VALID_FREQUENCIES;

/**
 * Validates survey form data.
 * Used client-side for instant feedback and mirrored server-side.
 * Returns an array of error strings, empty if valid.
 */
export function validateSurvey({ name, email, phone, frequency, consent }) {
  const errors = [];

  if (!name || name.trim().length < 2)
    errors.push('Name must be at least 2 characters.');
  if (name && name.trim().length > 120)
    errors.push('Name must be 120 characters or fewer.');
  if (name && !/^[\p{L}\p{M}'\- ]+$/u.test(name.trim()))
    errors.push('Name contains invalid characters.');

  // email is optional — only validate format if provided
  if (email && !email.includes('@'))
    errors.push('Please enter a valid email address.');
  if (email && email.length > 254)
    errors.push('Email address is too long.');

  if (!phone || phone.trim().length < 7)
    errors.push('Please enter a valid phone number.');
  if (phone && !/^\+?[\d\s\-().]{7,20}$/.test(phone.trim()))
    errors.push('Phone number contains invalid characters.');

  // frequency is optional — skip validation if empty
  if (frequency && !VALID_FREQUENCIES.includes(frequency))
    errors.push('Invalid frequency value.');

  if (!consent)
    errors.push('You must accept the consent statement.');

  return errors;
}