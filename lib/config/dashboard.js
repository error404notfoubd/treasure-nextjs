// ═══════════════════════════════════════════════
//  Dashboard auth (login, signup, availability API)
// ═══════════════════════════════════════════════

const dashboardConfig = {
  AUTH_API: {
    LOGIN_RATE_LIMIT_MAX_PER_WINDOW: 15,
    LOGIN_RATE_LIMIT_WINDOW_MS: 60 * 1000,

    SIGNUP_RATE_LIMIT_MAX_PER_WINDOW: 10,
    SIGNUP_RATE_LIMIT_WINDOW_MS: 60 * 60 * 1000,

    CHECK_AVAILABILITY_MAX_PER_WINDOW: 20,
    CHECK_AVAILABILITY_WINDOW_MS: 60 * 1000,

    PASSWORD_MIN_LENGTH: 8,
    DEFAULT_SIGNUP_ROLE: 'viewer',
  },

  AUTH_UI: {
    CHECK_DEBOUNCE_MS: 500,
  },
};

export default dashboardConfig;
