/**
 * In-memory rate limits for dashboard auth routes (per server instance).
 * Supplements production hardening; use Supabase fn_check_and_record_rate_limit if you need
 * cross-instance limits (see lib/rateLimit.js).
 */

const store = new Map();
const MAX_STORE_SIZE = 10_000;
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60_000;

function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, rec] of store) {
    if (now - rec.start > rec.windowMs) {
      store.delete(key);
    }
  }
}

/**
 * @param {string} ip
 * @param {string} routeKey e.g. 'auth_login'
 * @param {number} max requests per window
 * @param {number} windowMs
 * @returns {{ limited: boolean, retryAfterSec?: number }}
 */
export function checkAuthRouteRateLimit(ip, routeKey, max, windowMs) {
  cleanupExpiredEntries();

  const now = Date.now();
  const key = `${routeKey}:${ip}`;
  const rec = store.get(key);
  if (!rec || now - rec.start > windowMs) {
    if (store.size >= MAX_STORE_SIZE) {
      const oldest = store.keys().next().value;
      store.delete(oldest);
    }
    store.set(key, { count: 1, start: now, windowMs });
    return { limited: false };
  }
  rec.count += 1;
  if (rec.count > max) {
    return {
      limited: true,
      retryAfterSec: Math.max(1, Math.ceil((rec.start + windowMs - now) / 1000)),
    };
  }
  return { limited: false };
}
