import GAME_CONFIG from '@/lib/config';

export const VALID_FREQUENCIES = GAME_CONFIG.VALID_FREQUENCIES;

const F = GAME_CONFIG.SURVEY_FIELDS;

/** Max length for `favorite_game` in the request and stored value. */
const FAVORITE_GAME_MAX = 120;

/**
 * Validates survey form data.
 * Used client-side for instant feedback and mirrored server-side.
 * Returns an array of error strings, empty if valid.
 */
export function validateSurvey({ name, email, phone, frequency, favorite_game, consent }) {
  const errors = [];
  const favoriteGame =
    typeof favorite_game === 'string' ? favorite_game.replace(/\s+/g, ' ').trim() : '';

  if (!name || name.trim().length < F.NAME_MIN_LENGTH)
    errors.push(`Name must be at least ${F.NAME_MIN_LENGTH} characters.`);
  if (name && name.trim().length > F.NAME_MAX_LENGTH)
    errors.push(`Name must be ${F.NAME_MAX_LENGTH} characters or fewer.`);
  if (name && !/^[\p{L}\p{M}'\- ]+$/u.test(name.trim()))
    errors.push('Name contains invalid characters.');

  // email is optional — only validate format if provided
  if (email && !email.includes('@'))
    errors.push('Please enter a valid email address.');
  if (email && email.length > F.EMAIL_MAX_LENGTH)
    errors.push('Email address is too long.');

  if (!phone || phone.trim().length < F.PHONE_MIN_LENGTH)
    errors.push('Please enter a valid phone number.');
  if (
    phone &&
    !new RegExp(
      `^\\+?[\\d\\s\\-().]{${F.PHONE_MIN_LENGTH},${F.PHONE_PATTERN_MAX_LENGTH}}$`
    ).test(phone.trim())
  )
    errors.push('Phone number contains invalid characters.');

  // frequency is optional — skip validation if empty
  if (frequency && !VALID_FREQUENCIES.includes(frequency))
    errors.push('Invalid frequency value.');

  if (!favoriteGame) errors.push('Favorite game is required.');
  if (favoriteGame.length > FAVORITE_GAME_MAX)
    errors.push(`Favorite game must be ${FAVORITE_GAME_MAX} characters or fewer.`);

  if (!consent)
    errors.push('You must agree to the Privacy Policy and Terms and Conditions.');

  return errors;
}
