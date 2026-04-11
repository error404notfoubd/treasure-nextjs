/** Every Prelude SMS (initial registration send + resend), per IP. */
export function smsSendRateLimitOptions() {
  return {
    max: Math.max(1, parseInt(process.env.RATE_LIMIT_SMS_SEND_MAX || '20', 10) || 20),
    windowMs: Math.max(60_000, parseInt(process.env.RATE_LIMIT_SMS_SEND_WINDOW_MS || '86400000', 10) || 86400000),
  };
}

/** POST /api/survey/resend only, per IP. */
export function resendRouteRateLimitOptions() {
  return {
    max: Math.max(1, parseInt(process.env.RATE_LIMIT_RESEND_MAX || '8', 10) || 8),
    windowMs: Math.max(60_000, parseInt(process.env.RATE_LIMIT_RESEND_WINDOW_MS || '3600000', 10) || 3600000),
  };
}

export function otpResendCooldownSec() {
  const n = parseInt(process.env.OTP_RESEND_COOLDOWN_SEC || '60', 10);
  return Number.isFinite(n) && n >= 10 ? n : 60;
}
