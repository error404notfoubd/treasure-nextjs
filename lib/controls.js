// ═══════════════════════════════════════════════════════════════
//  TREASURE HUNT — Game Constants
//  Edit this file to control all game behaviour.
//  No other files need to be touched.
// ═══════════════════════════════════════════════════════════════

const GAME_CONFIG = {

  // ─────────────────────────────────────────────
  //  CREDITS
  // ─────────────────────────────────────────────

  // Credits given to every new player on load
  START_CREDITS: 20,

  // Bonus credits awarded after completing the survey
  BONUS_CREDITS: 10,


  // ─────────────────────────────────────────────
  //  WIN RATES
  // ─────────────────────────────────────────────

  // % chance any spin produces a win (0 = never win, 100 = always win)
  RTP: 20,

  // % of wins that become a 5-of-a-kind jackpot
  JACKPOT_RATE: 0,

  // % of wins that become 4-of-a-kind (rest are 3-of-a-kind)
  FOUR_OF_A_KIND_RATE: 3,


  // ─────────────────────────────────────────────
  //  SYMBOL WEIGHTS
  //  Lower number = rarer symbol
  //  These control how often each symbol appears on a reel.
  // ─────────────────────────────────────────────
  SYMBOL_WEIGHTS: {
    seven:   2,   // rarest — jackpot symbol
    diamond: 5,
    bell:    12,
    gold:    16,
    cherry:  18,
    bar:     20,
    coin:    22,  // most common
  },


  // ─────────────────────────────────────────────
  //  PAYOUT MULTIPLIERS
  //  Win amount = bet × multiplier
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
    four_of_a_kind: 4,   // any symbol
    three_of_a_kind: 2,  // any symbol
  },


  // ─────────────────────────────────────────────
  //  BET LIMITS
  // ─────────────────────────────────────────────

  // Preset bet buttons shown in the UI
  BET_PRESETS: [1, 5, 10, 15, 25, 50],


  // ─────────────────────────────────────────────
  //  REEL ANIMATION TIMING (milliseconds)
  //  Controls how long each reel spins before stopping.
  //  Each reel stops slightly later than the previous.
  // ─────────────────────────────────────────────
  REEL_STOP_DELAYS: [860, 1100, 1340, 1580, 1820],


  // ─────────────────────────────────────────────
  //  SURVEY
  // ─────────────────────────────────────────────
  VALID_FREQUENCIES: [
    'Daily — multiple times a day',
    'Daily — once a day',
    'A few times a week',
    'Once a week',
    'A few times a month',
    'Rarely',
  ],


  // ─────────────────────────────────────────────
  //  SITE INFO
  //  Used in legal pages, footer, and metadata.
  // ─────────────────────────────────────────────
  SITE: {
    NAME:       'Treasure Hunt Slots',
    URL:        'https://yourdomain.com',   // update before going live
    EMAIL:      'support@yourdomain.com',   // update before going live
    LAST_UPDATED: 'April 2026',
  }
};

module.exports = GAME_CONFIG;