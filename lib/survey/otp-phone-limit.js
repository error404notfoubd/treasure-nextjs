/**
 * Per-phone OTP send cap (rolling window). Uses RPC fn_check_and_record_otp_phone_send.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} phoneHash — from {@link phoneHash} in contact-storage
 * @param {{ max: number, windowMs: number }} options
 */
export async function checkOtpPhoneSendLimit(supabase, phoneHash, options) {
  if (!phoneHash) {
    return { limited: true, retryAfterSec: 3600 };
  }

  const windowSecs = Math.max(1, Math.round(options.windowMs / 1000));

  const { data, error } = await supabase.rpc('fn_check_and_record_otp_phone_send', {
    p_phone_hash: phoneHash,
    p_max: options.max,
    p_window_secs: windowSecs,
  });

  if (error) {
    console.error('[checkOtpPhoneSendLimit]', error.message ?? error);
    return { limited: false, retryAfterSec: 0 };
  }

  if (data === false) {
    return { limited: true, retryAfterSec: windowSecs };
  }
  return { limited: false, retryAfterSec: 0 };
}
