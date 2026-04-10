import { NextResponse } from 'next/server';

/**
 * Parses ALLOWED_DOMAINS into two Sets for fast lookup:
 *   hosts   — "example.com", "www.example.com"  (used for Host-header check)
 *   origins — "https://example.com"             (used for Origin / Referer check)
 *
 * When ALLOWED_DOMAINS is empty / unset, both Sets are empty
 * and the middleware is effectively disabled (local dev).
 */
function parseAllowedDomains() {
  const raw = process.env.ALLOWED_DOMAINS || '';
  const entries = raw
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  const hosts   = new Set();
  const origins = new Set();

  for (const entry of entries) {
    origins.add(entry);
    try {
      hosts.add(new URL(entry).host);
    } catch {
      hosts.add(entry);
    }
  }

  return { hosts, origins };
}

function originFromHeader(request) {
  const origin = request.headers.get('origin');
  if (origin) return origin.toLowerCase();

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin.toLowerCase();
    } catch {
      return null;
    }
  }
  return null;
}

export function middleware(request) {
  const { hosts, origins } = parseAllowedDomains();

  // When ALLOWED_DOMAINS is not configured, skip enforcement (local dev).
  if (hosts.size === 0) {
    return NextResponse.next();
  }

  // 1. Validate the Host header — blocks requests arriving via
  //    unauthorized domains, direct IP, or spoofed Host values.
  const host     = (request.headers.get('host') || '').toLowerCase();
  const hostBare = host.split(':')[0]; // strip port for comparison

  if (!hosts.has(host) && !hosts.has(hostBare)) {
    console.warn(`[middleware] blocked — host="${host}" not in ALLOWED_DOMAINS`);
    return new NextResponse('Forbidden', { status: 403 });
  }

  // 2. For requests that carry an Origin or Referer, verify it
  //    belongs to an allowed domain as well (cross-origin / API calls).
  const requestOrigin = originFromHeader(request);
  if (requestOrigin && !origins.has(requestOrigin)) {
    console.warn(
      `[middleware] blocked — origin="${requestOrigin}" to ${request.nextUrl.pathname}`
    );
    return NextResponse.json(
      { error: 'Forbidden — origin not allowed.' },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on every route except Next.js internals and static assets.
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
};
