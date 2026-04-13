/**
 * Dashboard management APIs must only be served on a dashboard.* hostname so the
 * marketing/game origin cannot drive session-authenticated admin calls (defense in depth
 * with cookie isolation + CSRF).
 *
 * Public survey OTP flow stays under /api/survey/* on any allowed host.
 */

import { NextResponse } from 'next/server';

export function hostBareFromRequest(request) {
  return (request.headers.get('host') || '').split(':')[0].toLowerCase();
}

/** Matches proxy: real dashboard subdomain (dashboard.example.com, dashboard.localhost, …). */
export function isDashboardHostname(hostBare) {
  return Boolean(hostBare && hostBare.startsWith('dashboard.'));
}

/** Paths that require a dashboard hostname (see proxy.js). */
export function isDashboardExclusiveApiPath(pathname) {
  if (!pathname.startsWith('/api/')) return false;
  if (pathname.startsWith('/api/survey')) return false;
  return (
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/users') ||
    pathname.startsWith('/api/responses') ||
    pathname.startsWith('/api/audit') ||
    pathname.startsWith('/api/dashboard')
  );
}

/**
 * Reject if Host is not dashboard.* — duplicates proxy so route handlers stay
 * correct if the matcher or edge config changes.
 *
 * @returns {NextResponse | null}
 */
export function rejectIfNotDashboardHost(request) {
  const hostBare = hostBareFromRequest(request);
  if (!isDashboardHostname(hostBare)) {
    return NextResponse.json(
      {
        error:
          'This endpoint is only available on the dashboard host (e.g. dashboard.example.com).',
      },
      { status: 403 }
    );
  }
  return null;
}
