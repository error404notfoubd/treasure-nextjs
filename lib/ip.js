/**
 * Extract the real client IP from a Next.js request, checking headers
 * set by common reverse proxies in priority order.
 *
 *  1. cf-connecting-ip   — Cloudflare
 *  2. x-real-ip          — Nginx, Vercel
 *  3. x-forwarded-for    — most load balancers (first entry = client)
 *  4. Fallback           — 127.0.0.1 (local dev / no proxy)
 */
export function getClientIP(request) {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();

  return '127.0.0.1';
}
