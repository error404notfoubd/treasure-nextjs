/**
 * Validate password strength beyond minimum length.
 * @param {string} password
 * @param {number} [minLength=8] — use {@link getAppSettings} on the server for the live minimum.
 * @returns {string[]} error messages (empty = valid)
 */
export function validatePasswordStrength(password, minLength = 8) {
  const errors = [];
  const min = Math.max(6, Math.min(128, Number(minLength) || 8));

  if (!password || password.length < min) {
    errors.push(`Password must be at least ${min} characters.`);
    return errors;
  }

  if (password.length > 128) {
    errors.push("Password must be 128 characters or fewer.");
    return errors;
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter.");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter.");
  }
  if (!/\d/.test(password)) {
    errors.push("Password must contain at least one number.");
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push("Password must contain at least one special character.");
  }

  return errors;
}
