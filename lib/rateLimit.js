/**
 * Distributed rate limiting via Supabase (works across serverless instances).
 * Disabled when NODE_ENV !== 'production'.
 * Requires fn_check_and_record_rate_limit (see sql/Create_All_functions.sql).
 */

const IS_PROD = process.env.NODE_ENV === 'production';

const DEFAULT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const DEFAULT_MAX       = parseInt(process.env.RATE_LIMIT_MAX)       || 5;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ip
 * @param {string} routeKey — e.g. 'survey_post', 'survey_verify'
 * @param {{ max?: number, windowMs?: number }} [options]
 */
export async function checkRateLimitDistributed(supabase, ip, routeKey, options = {}) {
  if (!IS_PROD) return { limited: false, retryAfterSec: 0 };

  const max = options.max ?? DEFAULT_MAX;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const windowSecs = Math.max(1, Math.round(windowMs / 1000));

  const { data, error } = await supabase.rpc('fn_check_and_record_rate_limit', {
    p_ip:            ip,
    p_route:         routeKey,
    p_max:           max,
    p_window_secs:   windowSecs,
  });

  if (error) {
    console.error('[checkRateLimitDistributed]', routeKey, error.message ?? error);
    return { limited: false, retryAfterSec: 0 };
  }

  if (data === false) {
    return { limited: true, retryAfterSec: windowSecs };
  }
  return { limited: false, retryAfterSec: 0 };
}
