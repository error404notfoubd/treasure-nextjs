// ═══════════════════════════════════════════════════════════════
//  SITE CONFIG — single source of truth for domain, contact,
//  branding, and legal metadata used across the app.
//
//  Update these values before going to production.
//
//  FACEBOOK_PAGE_URL: fallback only. Live value is `app_settings.facebook_page_url`
//  (see getAppSettings in lib/settings/app-settings.js and dashboard System settings).
// ═══════════════════════════════════════════════════════════════

const siteConfig = {
  NAME:         'Treasure Hunt',
  URL:          'https://treasure-hunt.fun',
  EMAIL:        'support@treasure-hunt.fun',
  LAST_UPDATED: 'April 2026',
  /** Fallback public Facebook URL when DB value is missing or invalid (https-only in app_settings). */
  FACEBOOK_PAGE_URL: 'https://www.facebook.com/treasurehuntdotfun',
};

export default siteConfig;
