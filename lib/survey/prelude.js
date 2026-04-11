import Prelude from '@prelude.so/sdk';

function getApiToken() {
  return process.env.PRELUDE_API_TOKEN || '';
}

export function isPreludeConfigured() {
  return Boolean(getApiToken());
}

/**
 * Prelude POST /v2/verification `status`: success | retry | challenged | blocked
 * @returns {Promise<
 *   | { ok: true, status: 'success' | 'retry' }
 *   | { ok: false, reason?: string, preludeStatus?: string }
 * >}
 */
export async function sendVerificationSms(e164) {
  const apiToken = getApiToken();
  if (!apiToken) {
    return { ok: false, reason: 'not_configured' };
  }

  const client = new Prelude({ apiToken });
  const res = await client.verification.create({
    target: { type: 'phone_number', value: e164 },
  });

  const preludeStatus = res.status;
  if (preludeStatus === 'success' || preludeStatus === 'retry') {
    return { ok: true, status: preludeStatus };
  }
  if (preludeStatus === 'challenged') {
    return { ok: false, preludeStatus: 'challenged', reason: 'challenged' };
  }
  if (preludeStatus === 'blocked') {
    return { ok: false, preludeStatus: 'blocked', reason: res.reason || 'blocked' };
  }
  return { ok: false, preludeStatus: preludeStatus ?? 'unknown', reason: 'unexpected_status' };
}

/** User-facing message when sendVerificationSms returns ok: false (not for not_configured). */
export function userMessageForPreludeSendFailure(result) {
  if (result.ok) return null;
  if (result.reason === 'not_configured') {
    return 'Phone verification is not available.';
  }
  if (result.preludeStatus === 'challenged' || result.reason === 'challenged') {
    return 'This verification could not be completed by SMS. Please try again later.';
  }
  const reason = result.reason;
  if (reason === 'invalid_phone_number' || reason === 'invalid_phone_line') {
    return 'This phone number cannot receive SMS codes. Please use a mobile number.';
  }
  if (reason === 'in_block_list') {
    return 'This number cannot be verified. Please use a different phone number.';
  }
  return 'We could not send a verification code. Please try again later.';
}

/**
 * @returns {Promise<boolean>} true if Prelude accepted the code
 */
export async function checkVerificationCode(e164, code) {
  const apiToken = getApiToken();
  if (!apiToken) {
    throw new Error('PRELUDE_API_TOKEN is not configured');
  }

  const normalized = String(code).replace(/\s/g, '');
  const client = new Prelude({ apiToken });
  const res = await client.verification.check({
    target: { type: 'phone_number', value: e164 },
    code: normalized,
  });

  return res.status === 'success';
}
