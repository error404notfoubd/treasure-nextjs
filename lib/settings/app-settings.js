import { unstable_cache } from "next/cache";
import { revalidateTag } from "next/cache";
import { supabase } from "@/lib/supabase";

const CACHE_TAG = "app-settings";

const SYMBOL_IDS = ["key", "crystal", "map", "compass", "shield", "scroll", "star"];

/** In-memory defaults if the row is missing or a column fails validation. */
export const DEFAULT_APP_SETTINGS = {
  startCredits: 15,
  bonusCredits: 100,
  rtp: 50,
  jackpotRate: 0,
  fourOfAKindRate: 3,
  symbolWeights: {
    key: 28,
    crystal: 20,
    map: 18,
    compass: 16,
    shield: 12,
    scroll: 9,
    star: 6,
  },
  findPayouts: { great_find: 4, good_find: 2 },
  betPresets: [1, 5, 10, 15, 25, 50],
  reelStopDelays: [860, 1100, 1340, 1580, 1820],
  surveyRequestBodyMaxChars: 8192,
  otpSendsPerPhoneMax: 3,
  otpSendsPerPhoneWindowMs: 60 * 60 * 1000,
  surveyControlPhoneE164: null,
  loginRateLimitMaxPerWindow: 15,
  loginRateLimitWindowMs: 60 * 1000,
  signupRateLimitMaxPerWindow: 10,
  signupRateLimitWindowMs: 60 * 60 * 1000,
  checkAvailabilityMaxPerWindow: 20,
  checkAvailabilityWindowMs: 60 * 1000,
  passwordMinLength: 8,
  defaultSignupRole: "viewer",
  authUiCheckDebounceMs: 500,
};

function asInt(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.trunc(v) : fallback;
}

function mergeSymbolWeights(raw) {
  const out = { ...DEFAULT_APP_SETTINGS.symbolWeights };
  if (!raw || typeof raw !== "object") return out;
  for (const id of SYMBOL_IDS) {
    const v = asInt(raw[id], out[id]);
    if (v > 0 && v <= 1000) out[id] = v;
  }
  return out;
}

function mergeFindPayouts(raw) {
  const base = { ...DEFAULT_APP_SETTINGS.findPayouts };
  if (!raw || typeof raw !== "object") return base;
  const g = asInt(raw.great_find, base.great_find);
  const gd = asInt(raw.good_find, base.good_find);
  if (g > 0 && g <= 100) base.great_find = g;
  if (gd > 0 && gd <= 100) base.good_find = gd;
  return base;
}

function parsePositiveIntArray(raw, fallback, { maxLen = 20, maxVal = 10_000 } = {}) {
  let arr = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [...fallback];
    }
  }
  if (!Array.isArray(arr)) return [...fallback];
  const nums = arr
    .map((x) => asInt(x, NaN))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= maxVal);
  if (nums.length === 0) return [...fallback];
  return nums.slice(0, maxLen);
}

function rowToSettings(row) {
  if (!row) {
    return {
      ...DEFAULT_APP_SETTINGS,
      symbolWeights: { ...DEFAULT_APP_SETTINGS.symbolWeights },
      findPayouts: { ...DEFAULT_APP_SETTINGS.findPayouts },
      betPresets: [...DEFAULT_APP_SETTINGS.betPresets],
      reelStopDelays: [...DEFAULT_APP_SETTINGS.reelStopDelays],
    };
  }

  const control =
    row.survey_control_phone_e164 == null || String(row.survey_control_phone_e164).trim() === ""
      ? null
      : String(row.survey_control_phone_e164).trim();

  return {
    startCredits: Math.max(0, asInt(row.start_credits, DEFAULT_APP_SETTINGS.startCredits)),
    bonusCredits: Math.max(0, asInt(row.bonus_credits, DEFAULT_APP_SETTINGS.bonusCredits)),
    rtp: Math.min(100, Math.max(0, asInt(row.rtp, DEFAULT_APP_SETTINGS.rtp))),
    jackpotRate: Math.min(100, Math.max(0, asInt(row.jackpot_rate, DEFAULT_APP_SETTINGS.jackpotRate))),
    fourOfAKindRate: Math.min(100, Math.max(0, asInt(row.four_of_a_kind_rate, DEFAULT_APP_SETTINGS.fourOfAKindRate))),
    symbolWeights: mergeSymbolWeights(row.symbol_weights),
    findPayouts: mergeFindPayouts(row.find_payouts),
    betPresets: parsePositiveIntArray(row.bet_presets, DEFAULT_APP_SETTINGS.betPresets),
    reelStopDelays: parsePositiveIntArray(row.reel_stop_delays, DEFAULT_APP_SETTINGS.reelStopDelays, {
      maxLen: 10,
      maxVal: 60_000,
    }),
    surveyRequestBodyMaxChars: Math.min(
      1_048_576,
      Math.max(
        1024,
        asInt(row.survey_request_body_max_chars, DEFAULT_APP_SETTINGS.surveyRequestBodyMaxChars)
      )
    ),
    otpSendsPerPhoneMax: Math.max(1, asInt(row.otp_sends_per_phone_max, DEFAULT_APP_SETTINGS.otpSendsPerPhoneMax)),
    otpSendsPerPhoneWindowMs: Math.max(
      60_000,
      asInt(row.otp_sends_per_phone_window_ms, DEFAULT_APP_SETTINGS.otpSendsPerPhoneWindowMs)
    ),
    surveyControlPhoneE164: control,
    loginRateLimitMaxPerWindow: Math.max(
      1,
      asInt(row.login_rate_limit_max_per_window, DEFAULT_APP_SETTINGS.loginRateLimitMaxPerWindow)
    ),
    loginRateLimitWindowMs: Math.max(
      1000,
      asInt(row.login_rate_limit_window_ms, DEFAULT_APP_SETTINGS.loginRateLimitWindowMs)
    ),
    signupRateLimitMaxPerWindow: Math.max(
      1,
      asInt(row.signup_rate_limit_max_per_window, DEFAULT_APP_SETTINGS.signupRateLimitMaxPerWindow)
    ),
    signupRateLimitWindowMs: Math.max(
      1000,
      asInt(row.signup_rate_limit_window_ms, DEFAULT_APP_SETTINGS.signupRateLimitWindowMs)
    ),
    checkAvailabilityMaxPerWindow: Math.max(
      1,
      asInt(row.check_availability_max_per_window, DEFAULT_APP_SETTINGS.checkAvailabilityMaxPerWindow)
    ),
    checkAvailabilityWindowMs: Math.max(
      1000,
      asInt(row.check_availability_window_ms, DEFAULT_APP_SETTINGS.checkAvailabilityWindowMs)
    ),
    passwordMinLength: Math.min(
      128,
      Math.max(6, asInt(row.password_min_length, DEFAULT_APP_SETTINGS.passwordMinLength))
    ),
    defaultSignupRole: ["viewer", "editor", "admin"].includes(row.default_signup_role)
      ? row.default_signup_role
      : DEFAULT_APP_SETTINGS.defaultSignupRole,
    authUiCheckDebounceMs: Math.min(
      10_000,
      Math.max(100, asInt(row.auth_ui_check_debounce_ms, DEFAULT_APP_SETTINGS.authUiCheckDebounceMs))
    ),
  };
}

async function fetchAppSettingsRow() {
  const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
  if (error) {
    console.error("[app_settings]", error.message ?? error);
    return null;
  }
  return data;
}

export const getAppSettings = unstable_cache(
  async () => {
    const data = await fetchAppSettingsRow();
    return rowToSettings(data);
  },
  ["app_settings_row_v1"],
  { tags: [CACHE_TAG], revalidate: 120 }
);

export function invalidateAppSettingsCache() {
  revalidateTag(CACHE_TAG);
}

/** Props the slot client reads from `config` (no secrets). */
export function slotGameEconomyForConfig(s) {
  return {
    START_CREDITS: s.startCredits,
    BONUS_CREDITS: s.bonusCredits,
    RTP: s.rtp,
    JACKPOT_RATE: s.jackpotRate,
    FOUR_OF_A_KIND_RATE: s.fourOfAKindRate,
    SYMBOL_WEIGHTS: s.symbolWeights,
    FIND_PAYOUTS: s.findPayouts,
    BET_PRESETS: s.betPresets,
    REEL_STOP_DELAYS: s.reelStopDelays,
  };
}

export async function getSignupFormSettings() {
  const s = await getAppSettings();
  return {
    passwordMinLength: s.passwordMinLength,
    checkDebounceMs: s.authUiCheckDebounceMs,
  };
}

function settingsToDbRow(s) {
  return {
    id: 1,
    start_credits: s.startCredits,
    bonus_credits: s.bonusCredits,
    rtp: s.rtp,
    jackpot_rate: s.jackpotRate,
    four_of_a_kind_rate: s.fourOfAKindRate,
    symbol_weights: s.symbolWeights,
    find_payouts: s.findPayouts,
    bet_presets: s.betPresets,
    reel_stop_delays: s.reelStopDelays,
    survey_request_body_max_chars: s.surveyRequestBodyMaxChars,
    otp_sends_per_phone_max: s.otpSendsPerPhoneMax,
    otp_sends_per_phone_window_ms: s.otpSendsPerPhoneWindowMs,
    survey_control_phone_e164: s.surveyControlPhoneE164,
    login_rate_limit_max_per_window: s.loginRateLimitMaxPerWindow,
    login_rate_limit_window_ms: s.loginRateLimitWindowMs,
    signup_rate_limit_max_per_window: s.signupRateLimitMaxPerWindow,
    signup_rate_limit_window_ms: s.signupRateLimitWindowMs,
    check_availability_max_per_window: s.checkAvailabilityMaxPerWindow,
    check_availability_window_ms: s.checkAvailabilityWindowMs,
    password_min_length: s.passwordMinLength,
    default_signup_role: s.defaultSignupRole,
    auth_ui_check_debounce_ms: s.authUiCheckDebounceMs,
  };
}

/** Validates owner PATCH body; returns `{ settings }` or `{ error }`. */
export function parseAppSettingsPatch(body, current) {
  if (!body || typeof body !== "object") {
    return { error: "Invalid JSON body." };
  }

  const b = /** @type {Record<string, unknown>} */ (body);

  const next = {
    ...current,
    startCredits: b.startCredits !== undefined ? asInt(b.startCredits, current.startCredits) : current.startCredits,
    bonusCredits: b.bonusCredits !== undefined ? asInt(b.bonusCredits, current.bonusCredits) : current.bonusCredits,
    rtp: b.rtp !== undefined ? asInt(b.rtp, current.rtp) : current.rtp,
    jackpotRate: b.jackpotRate !== undefined ? asInt(b.jackpotRate, current.jackpotRate) : current.jackpotRate,
    fourOfAKindRate:
      b.fourOfAKindRate !== undefined ? asInt(b.fourOfAKindRate, current.fourOfAKindRate) : current.fourOfAKindRate,
    symbolWeights:
      b.symbolWeights !== undefined ? mergeSymbolWeights(b.symbolWeights) : { ...current.symbolWeights },
    findPayouts: b.findPayouts !== undefined ? mergeFindPayouts(b.findPayouts) : { ...current.findPayouts },
    betPresets:
      b.betPresets !== undefined
        ? parsePositiveIntArray(b.betPresets, current.betPresets)
        : [...current.betPresets],
    reelStopDelays:
      b.reelStopDelays !== undefined
        ? parsePositiveIntArray(b.reelStopDelays, current.reelStopDelays, { maxLen: 10, maxVal: 60_000 })
        : [...current.reelStopDelays],
    surveyRequestBodyMaxChars:
      b.surveyRequestBodyMaxChars !== undefined
        ? asInt(b.surveyRequestBodyMaxChars, current.surveyRequestBodyMaxChars)
        : current.surveyRequestBodyMaxChars,
    otpSendsPerPhoneMax:
      b.otpSendsPerPhoneMax !== undefined
        ? asInt(b.otpSendsPerPhoneMax, current.otpSendsPerPhoneMax)
        : current.otpSendsPerPhoneMax,
    otpSendsPerPhoneWindowMs:
      b.otpSendsPerPhoneWindowMs !== undefined
        ? asInt(b.otpSendsPerPhoneWindowMs, current.otpSendsPerPhoneWindowMs)
        : current.otpSendsPerPhoneWindowMs,
    surveyControlPhoneE164:
      b.surveyControlPhoneE164 === undefined
        ? current.surveyControlPhoneE164
        : b.surveyControlPhoneE164 === null || b.surveyControlPhoneE164 === ""
          ? null
          : String(b.surveyControlPhoneE164).trim(),
    loginRateLimitMaxPerWindow:
      b.loginRateLimitMaxPerWindow !== undefined
        ? asInt(b.loginRateLimitMaxPerWindow, current.loginRateLimitMaxPerWindow)
        : current.loginRateLimitMaxPerWindow,
    loginRateLimitWindowMs:
      b.loginRateLimitWindowMs !== undefined
        ? asInt(b.loginRateLimitWindowMs, current.loginRateLimitWindowMs)
        : current.loginRateLimitWindowMs,
    signupRateLimitMaxPerWindow:
      b.signupRateLimitMaxPerWindow !== undefined
        ? asInt(b.signupRateLimitMaxPerWindow, current.signupRateLimitMaxPerWindow)
        : current.signupRateLimitMaxPerWindow,
    signupRateLimitWindowMs:
      b.signupRateLimitWindowMs !== undefined
        ? asInt(b.signupRateLimitWindowMs, current.signupRateLimitWindowMs)
        : current.signupRateLimitWindowMs,
    checkAvailabilityMaxPerWindow:
      b.checkAvailabilityMaxPerWindow !== undefined
        ? asInt(b.checkAvailabilityMaxPerWindow, current.checkAvailabilityMaxPerWindow)
        : current.checkAvailabilityMaxPerWindow,
    checkAvailabilityWindowMs:
      b.checkAvailabilityWindowMs !== undefined
        ? asInt(b.checkAvailabilityWindowMs, current.checkAvailabilityWindowMs)
        : current.checkAvailabilityWindowMs,
    passwordMinLength:
      b.passwordMinLength !== undefined ? asInt(b.passwordMinLength, current.passwordMinLength) : current.passwordMinLength,
    defaultSignupRole:
      b.defaultSignupRole !== undefined
        ? String(b.defaultSignupRole).trim().toLowerCase()
        : current.defaultSignupRole,
    authUiCheckDebounceMs:
      b.authUiCheckDebounceMs !== undefined
        ? asInt(b.authUiCheckDebounceMs, current.authUiCheckDebounceMs)
        : current.authUiCheckDebounceMs,
  };

  const normalized = rowToSettings(settingsToDbRow(next));
  const err = validateSettingsForDb(normalized);
  if (err) return { error: err };
  return { settings: normalized };
}

function validateSettingsForDb(s) {
  if (s.startCredits < 0 || s.startCredits > 100000) return "startCredits out of range.";
  if (s.bonusCredits < 0 || s.bonusCredits > 100000) return "bonusCredits out of range.";
  if (s.rtp < 0 || s.rtp > 100) return "rtp out of range.";
  if (s.jackpotRate < 0 || s.jackpotRate > 100) return "jackpotRate out of range.";
  if (s.fourOfAKindRate < 0 || s.fourOfAKindRate > 100) return "fourOfAKindRate out of range.";
  if (s.surveyRequestBodyMaxChars < 1024 || s.surveyRequestBodyMaxChars > 1048576) {
    return "surveyRequestBodyMaxChars out of range.";
  }
  if (s.otpSendsPerPhoneMax < 1 || s.otpSendsPerPhoneMax > 100) return "otpSendsPerPhoneMax out of range.";
  if (s.otpSendsPerPhoneWindowMs < 60000 || s.otpSendsPerPhoneWindowMs > 86400000 * 7) {
    return "otpSendsPerPhoneWindowMs out of range.";
  }
  if (s.passwordMinLength < 6 || s.passwordMinLength > 128) return "passwordMinLength out of range.";
  if (!["viewer", "editor", "admin"].includes(s.defaultSignupRole)) return "defaultSignupRole must be viewer, editor, or admin.";
  if (s.authUiCheckDebounceMs < 100 || s.authUiCheckDebounceMs > 10000) return "authUiCheckDebounceMs out of range.";
  if (s.loginRateLimitMaxPerWindow < 1 || s.loginRateLimitMaxPerWindow > 10000) return "loginRateLimitMaxPerWindow out of range.";
  if (s.loginRateLimitWindowMs < 1000 || s.loginRateLimitWindowMs > 86400000) return "loginRateLimitWindowMs out of range.";
  if (s.signupRateLimitMaxPerWindow < 1 || s.signupRateLimitMaxPerWindow > 10000) {
    return "signupRateLimitMaxPerWindow out of range.";
  }
  if (s.signupRateLimitWindowMs < 1000 || s.signupRateLimitWindowMs > 86400000 * 30) {
    return "signupRateLimitWindowMs out of range.";
  }
  if (s.checkAvailabilityMaxPerWindow < 1 || s.checkAvailabilityMaxPerWindow > 10000) {
    return "checkAvailabilityMaxPerWindow out of range.";
  }
  if (s.checkAvailabilityWindowMs < 1000 || s.checkAvailabilityWindowMs > 86400000) {
    return "checkAvailabilityWindowMs out of range.";
  }
  if (s.surveyControlPhoneE164 != null && s.surveyControlPhoneE164.length < 8) {
    return "surveyControlPhoneE164 must be null/empty or a plausible E.164 value.";
  }
  if (s.betPresets.length < 1 || s.betPresets.length > 20) return "betPresets must have 1–20 values.";
  if (s.reelStopDelays.length < 1 || s.reelStopDelays.length > 10) return "reelStopDelays must have 1–10 values.";
  return null;
}

export async function persistAppSettings(settings) {
  const row = settingsToDbRow(settings);
  const { error } = await supabase.from("app_settings").upsert(row, { onConflict: "id" });
  if (error) {
    console.error("[persistAppSettings]", error.message ?? error);
    return { ok: false, error: error.message || "Database error." };
  }
  invalidateAppSettingsCache();
  return { ok: true };
}

/** JSON shape for dashboard GET (camelCase). */
export function appSettingsToJson(s) {
  return {
    startCredits: s.startCredits,
    bonusCredits: s.bonusCredits,
    rtp: s.rtp,
    jackpotRate: s.jackpotRate,
    fourOfAKindRate: s.fourOfAKindRate,
    symbolWeights: s.symbolWeights,
    findPayouts: s.findPayouts,
    betPresets: s.betPresets,
    reelStopDelays: s.reelStopDelays,
    surveyRequestBodyMaxChars: s.surveyRequestBodyMaxChars,
    otpSendsPerPhoneMax: s.otpSendsPerPhoneMax,
    otpSendsPerPhoneWindowMs: s.otpSendsPerPhoneWindowMs,
    surveyControlPhoneE164: s.surveyControlPhoneE164,
    loginRateLimitMaxPerWindow: s.loginRateLimitMaxPerWindow,
    loginRateLimitWindowMs: s.loginRateLimitWindowMs,
    signupRateLimitMaxPerWindow: s.signupRateLimitMaxPerWindow,
    signupRateLimitWindowMs: s.signupRateLimitWindowMs,
    checkAvailabilityMaxPerWindow: s.checkAvailabilityMaxPerWindow,
    checkAvailabilityWindowMs: s.checkAvailabilityWindowMs,
    passwordMinLength: s.passwordMinLength,
    defaultSignupRole: s.defaultSignupRole,
    authUiCheckDebounceMs: s.authUiCheckDebounceMs,
  };
}
