import { maxTokenAgeMs } from '@/lib/survey/token';

export const SURVEY_SESSION_COOKIE = 'survey_session';

/**
 * Read signed survey session token from HttpOnly cookie (set by API routes).
 */
export function getSurveySessionToken(request) {
  const raw = request.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name !== SURVEY_SESSION_COOKIE) continue;
    const value = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function buildSurveySessionSetCookie(token) {
  const maxAge = Math.max(60, Math.floor(maxTokenAgeMs() / 1000));
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SURVEY_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function buildSurveySessionClearCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SURVEY_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
