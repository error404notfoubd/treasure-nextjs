import siteConfig from './site.js';

// ═══════════════════════════════════════════════════════════════
//  Public treasure hunt game + on-game survey + site metadata
//  Economy, auth rate limits, and survey caps live in DB (`app_settings`) — see lib/settings/app-settings.js
// ═══════════════════════════════════════════════════════════════

const gameConfig = {
  // ─────────────────────────────────────────────
  //  Survey (modal on game)
  // ─────────────────────────────────────────────
  VALID_FREQUENCIES: [
    'Daily — multiple times a day',
    'Daily — once a day',
    'A few times a week',
    'Once a week',
    'A few times a month',
    'Rarely',
  ],

  /** Shown as a fixed prefix in the survey phone field; users type national digits only. */
  SURVEY_DEFAULT_COUNTRY_CODE: '+1',

  SURVEY_FIELDS: {
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 120,
    EMAIL_MAX_LENGTH: 254,
    PHONE_MIN_LENGTH: 7,
    PHONE_PATTERN_MAX_LENGTH: 20,
  },

  SITE: siteConfig,

  // ─────────────────────────────────────────────
  //  Reel geometry (must match globals.css --reel-h)
  // ─────────────────────────────────────────────
  SLOT_UI: {
    SYM_H: 88,
    STRIP: 32,
    HYDRATION_DELAY_MS: 150,
  },
};

export default gameConfig;
