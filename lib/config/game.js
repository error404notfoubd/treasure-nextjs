import siteConfig from './site.js';

// ═══════════════════════════════════════════════════════════════
//  Public slot game + on-game survey + site metadata
// ═══════════════════════════════════════════════════════════════

const gameConfig = {
  // ─────────────────────────────────────────────
  //  CREDITS
  // ─────────────────────────────────────────────
  START_CREDITS: 20,
  BONUS_CREDITS: 10,

  // ─────────────────────────────────────────────
  //  WIN RATES
  // ─────────────────────────────────────────────
  RTP: 20,
  JACKPOT_RATE: 0,
  FOUR_OF_A_KIND_RATE: 3,

  // ─────────────────────────────────────────────
  //  SYMBOL WEIGHTS (lower = rarer)
  // ─────────────────────────────────────────────
  SYMBOL_WEIGHTS: {
    seven:   2,
    diamond: 5,
    bell:    12,
    gold:    16,
    cherry:  18,
    bar:     20,
    coin:    22,
  },

  // ─────────────────────────────────────────────
  //  PAYOUT MULTIPLIERS (win = bet × mult)
  // ─────────────────────────────────────────────
  PAYOUTS: {
    five_of_a_kind: {
      seven:   100,
      diamond: 50,
      bell:    20,
      cherry:  15,
      gold:    10,
      bar:     6,
      coin:    3,
    },
    four_of_a_kind: 4,
    three_of_a_kind: 2,
  },

  BET_PRESETS: [1, 5, 10, 15, 25, 50],

  REEL_STOP_DELAYS: [860, 1100, 1340, 1580, 1820],

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

  SURVEY_FIELDS: {
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 120,
    EMAIL_MAX_LENGTH: 254,
    PHONE_MIN_LENGTH: 7,
    PHONE_PATTERN_MAX_LENGTH: 20,
  },

  SURVEY_API: {
    REQUEST_BODY_MAX_CHARS: 8192,
  },

  SITE: siteConfig,

  // ─────────────────────────────────────────────
  //  Reel geometry (must match globals.css --reel-h)
  // ─────────────────────────────────────────────
  SLOT_UI: {
    SYM_H: 88,
    STRIP: 32,
    HYDRATION_DELAY_MS: 120,
  },
};

export default gameConfig;
