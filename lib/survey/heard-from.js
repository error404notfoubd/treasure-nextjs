const MAX_LEN = 500;

/**
 * Single text value for `public.users.heard_from` (how they heard about you).
 * @param {unknown} raw
 * @returns {{ value: string } | { error: string }}
 */
export function normalizeHeardFromInput(raw) {
  const t = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_LEN) : "";
  if (!t) {
    return { error: "Please enter how you heard about us." };
  }
  return { value: t };
}
