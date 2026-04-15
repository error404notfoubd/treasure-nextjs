/** Preset answers stored verbatim in `public.users.heard_from`. */
export const HEARD_FROM_PRESET_LABELS = [
  "Facebook (Groups)",
  "Facebook (Ads)",
  "Google Ads",
];

/** Client-only select value for free-text "Other" (never stored in DB). */
export const HEARD_FROM_OTHER_VALUE = "__heard_other__";

export const HEARD_FROM_PRESET_SET = new Set(HEARD_FROM_PRESET_LABELS);

const MAX_LEN = 500;

/**
 * @param {unknown} raw
 * @returns {{ value: string } | { error: string }}
 */
export function normalizeHeardFromInput(raw) {
  const t = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_LEN) : "";
  if (!t) {
    return { error: "Please tell us how you heard about us." };
  }
  if (HEARD_FROM_PRESET_SET.has(t)) {
    return { value: t };
  }
  if (t.length < 2) {
    return { error: "Please enter a bit more detail (at least 2 characters)." };
  }
  return { value: t };
}
