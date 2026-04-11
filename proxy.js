import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import {
  isDashboardExclusiveApiPath,
  isDashboardHostname,
} from './lib/dashboard/api-host.js';

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

const CSRF_COOKIE = '_csrf';
const CSRF_HEADER = 'x-csrf-token';
const SESSION_COOKIE = '_sid';

// ── Host allowlist: one optional apex domain + one optional local host ─────
/** Strip scheme/path/port; lowercase. For production apex, strip one leading `www.`. */
function normalizeAllowedDomain(raw) {
  if (!raw) return '';
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.split('/')[0];
  s = s.split(':')[0];
  if (s.startsWith('www.')) s = s.slice(4);
  return s;
}

function normalizeLocalHostLabel(raw) {
  if (!raw) return '';
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.split('/')[0];
  s = s.split(':')[0];
  return s;
}

/** `apex` is normalized (e.g. example.com). Allows apex, www, and any subdomain. */
function hostMatchesApex(hostBare, apex) {
  if (!apex) return false;
  const h = hostBare.toLowerCase();
  return h === apex || h.endsWith(`.${apex}`);
}

/**
 * Local dev host. `localhost` also allows *.localhost, 127.0.0.1, [::1].
 * Other labels match that name or subdomains (e.g. myapp.test → *.myapp.test).
 */
function hostMatchesLocal(hostBare, localLabel) {
  if (!localLabel) return false;
  const h = hostBare.toLowerCase();
  if (localLabel === 'localhost') {
    return (
      h === 'localhost' ||
      h.endsWith('.localhost') ||
      h === '127.0.0.1' ||
      h === '[::1]'
    );
  }
  if (localLabel === '127.0.0.1' || localLabel === '[::1]') {
    return h === localLabel;
  }
  return h === localLabel || h.endsWith(`.${localLabel}`);
}

function hostAllowed(hostBare, apex, localLabel) {
  return (
    (apex && hostMatchesApex(hostBare, apex)) ||
    (localLabel && hostMatchesLocal(hostBare, localLabel))
  );
}

/** Origin/referer URL must use http(s) and a hostname allowed by apex or local rules. */
function originAllowed(originLowercase, apex, localLabel) {
  if (!originLowercase) return true;
  try {
    const u = new URL(originLowercase);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return hostAllowed(h, apex, localLabel);
  } catch {
    return false;
  }
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

function getHostBare(request) {
  return (request.headers.get('host') || '').split(':')[0].toLowerCase();
}

function isLocalHost(hostname) {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

/** Dashboard is always hostname `dashboard.*` (e.g. dashboard.example.com, dashboard.localhost). */
function isRealDashboardHost(hostBare) {
  return hostBare.startsWith('dashboard.');
}

function isDashboardOnlyPath(pathname) {
  return (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname.startsWith('/dashboard')
  );
}

function requestProto(request) {
  const forwarded = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwarded === 'http' || forwarded === 'https') return forwarded;
  const u = new URL(request.url);
  return u.protocol === 'https:' ? 'https' : 'http';
}

/**
 * Canonical dashboard origin for this request’s deployment.
 * Rule: `dashboard.` + apex host (strip leading `www.`), same port and scheme as the request.
 * Local hosts map to `dashboard.localhost` + port.
 */
function getDerivedDashboardOrigin(request) {
  const u = new URL(request.url);
  const hostname = u.hostname.toLowerCase();
  const port = u.port ? `:${u.port}` : '';
  const proto = requestProto(request);

  if (hostname.startsWith('dashboard.')) {
    return `${proto}://${hostname}${port}`;
  }

  if (isLocalHost(hostname)) {
    return `${proto}://dashboard.localhost${port}`;
  }

  const apex = hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  return `${proto}://dashboard.${apex}${port}`;
}

/** Marketing / game origin when the user is on the dashboard host (strip `dashboard.`). */
function mainOriginFromRequest(request) {
  const proto = requestProto(request);
  const u = new URL(request.url);
  const h = u.hostname.toLowerCase();
  const port = u.port ? `:${u.port}` : '';
  if (!h.startsWith('dashboard.')) {
    return `${proto}://${h}${port}`;
  }
  return `${proto}://${h.slice('dashboard.'.length)}${port}`;
}

function isDashboardCsrfApi(pathname) {
  return isDashboardExclusiveApiPath(pathname);
}

let _hostWarningLogged = false;

export async function proxy(request) {
  const allowedApex = normalizeAllowedDomain(process.env.ALLOWED_DOMAIN || '');
  const localLabel = normalizeLocalHostLabel(process.env.LOCAL_ALLOWED_HOST || '');
  const enforceHosts = Boolean(allowedApex || localLabel);

  if (!enforceHosts && process.env.NODE_ENV === 'production' && !_hostWarningLogged) {
    _hostWarningLogged = true;
    console.warn(
      '[proxy] WARNING: Neither ALLOWED_DOMAIN nor LOCAL_ALLOWED_HOST is set. ' +
      'Host and Origin enforcement is DISABLED. Set ALLOWED_DOMAIN for production.'
    );
  }

  const { pathname, search } = request.nextUrl;
  const hostBare = getHostBare(request);
  const onRealDashboard = isRealDashboardHost(hostBare);

  if (enforceHosts) {
    if (!hostAllowed(hostBare, allowedApex, localLabel)) {
      const hostFull = (request.headers.get('host') || '').toLowerCase();
      console.warn(
        `[proxy] blocked — host="${hostFull}" not allowed by ALLOWED_DOMAIN / LOCAL_ALLOWED_HOST`
      );
      return new NextResponse('Forbidden', { status: 403 });
    }

    const requestOrigin = originFromHeader(request);
    if (requestOrigin && !originAllowed(requestOrigin, allowedApex, localLabel)) {
      console.warn(
        `[proxy] blocked — origin="${requestOrigin}" to ${pathname}`
      );
      return NextResponse.json(
        { error: 'Forbidden — origin not allowed.' },
        { status: 403 }
      );
    }
  }

  // Dashboard admin APIs: only on dashboard.* (not on www / apex / game host).
  if (
    pathname.startsWith('/api/') &&
    isDashboardExclusiveApiPath(pathname) &&
    !isDashboardHostname(hostBare)
  ) {
    return NextResponse.json(
      {
        error:
          'This endpoint is only available on the dashboard host (e.g. dashboard.example.com).',
      },
      { status: 403 }
    );
  }

  const csrfCookie = request.cookies.get(CSRF_COOKIE)?.value;

  // ── CSRF: dashboard APIs only (survey APIs unchanged) ─────────────────
  if (pathname.startsWith('/api/')) {
    if (
      isDashboardCsrfApi(pathname) &&
      ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)
    ) {
      const headerToken = request.headers.get(CSRF_HEADER);
      if (!csrfCookie || !headerToken || !constantTimeEqual(csrfCookie, headerToken)) {
        return NextResponse.json(
          { error: 'CSRF token missing or invalid' },
          { status: 403 }
        );
      }
    }
  }

  const dashOrigin = getDerivedDashboardOrigin(request);

  // ── Dashboard routes only on dashboard.* (redirect from apex / www / localhost) ─
  if (!onRealDashboard && isDashboardOnlyPath(pathname)) {
    const target = `${dashOrigin}${pathname}${search}`;
    return NextResponse.redirect(target);
  }

  // ── Marketing/legal pages live on the main site only ────────────────────
  if (onRealDashboard && (pathname === '/terms' || pathname === '/privacy')) {
    const main = mainOriginFromRequest(request);
    return NextResponse.redirect(`${main}${pathname}${search}`);
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const dashPaths =
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname.startsWith('/dashboard');

  // Include dashboard-only APIs so `_sid` is issued/cleared when JWT is present/absent
  // (page routes alone never ran this for `/api/auth/me`, breaking post-login checks).
  const shouldApplyDashboardAuth =
    onRealDashboard &&
    ((!pathname.startsWith('/api/') && (pathname === '/' || dashPaths)) ||
      (pathname.startsWith('/api/') && isDashboardExclusiveApiPath(pathname)));

  if (shouldApplyDashboardAuth) {
    const supabase = createServerClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              response = NextResponse.next({
                request: { headers: request.headers },
              });
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && !request.cookies.get(SESSION_COOKIE)?.value) {
      response.cookies.set(SESSION_COOKIE, crypto.randomUUID(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    if (!user && request.cookies.get(SESSION_COOKIE)?.value) {
      response.cookies.delete(SESSION_COOKIE);
    }

    if (pathname.startsWith('/dashboard') && !user) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Do not redirect login/signup → dashboard here: JWT can exist without a `profiles`
    // row (or before _sid is visible to RSC). Server layouts use getSessionUser() to
    // decide when a user may enter the app.

    if (pathname === '/') {
      if (user) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  if (!csrfCookie) {
    response.cookies.set(CSRF_COOKIE, crypto.randomUUID(), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
  }

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );

  if (pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
