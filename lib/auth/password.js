import GAME_CONFIG from '@/lib/config';

const { AUTH_API } = GAME_CONFIG;

/**
 * Validate password strength beyond minimum length.
 * Returns an array of error messages (empty = valid).
 */
export function validatePasswordStrength(password) {
  const errors = [];
  const min = AUTH_API.PASSWORD_MIN_LENGTH || 8;

  if (!password || password.length < min) {
    errors.push(`Password must be at least ${min} characters.`);
    return errors;
  }

  if (password.length > 128) {
    errors.push('Password must be 128 characters or fewer.');
    return errors;
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter.');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter.');
  }
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number.');
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character.');
  }

  return errors;
}
