/**
 * Build absolute origin for the current dashboard request (for Supabase redirectTo / emailRedirectTo).
 */
export function dashboardOriginFromRequest(request) {
  const host = request.headers.get("host") || "";
  if (!host) return null;
  const xf = request.headers.get("x-forwarded-proto");
  const protocol =
    (xf && xf.split(",")[0].trim()) ||
    (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${protocol}://${host}`;
}
