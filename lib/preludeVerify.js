import Prelude from '@prelude.so/sdk';

function getApiToken() {
  return process.env.PRELUDE_API_TOKEN || process.env.API_TOKEN || '';
}

export function isPreludeConfigured() {
  return Boolean(getApiToken());
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, reason?: string }>}
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

  if (res.status === 'blocked') {
    return { ok: false, reason: res.reason || 'blocked' };
  }
  if (res.status !== 'success' && res.status !== 'retry') {
    return { ok: false, reason: 'unexpected_status' };
  }
  return { ok: true };
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
