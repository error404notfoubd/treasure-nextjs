import { NextResponse } from "next/server";
import { getAuthAdminClient } from "@/lib/supabase";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";
import { getClientIP } from "@/lib/ip";
import { checkAuthRouteRateLimit } from "@/lib/auth/route-rate-limit";
import GAME_CONFIG from "@/lib/config";

const { AUTH_API } = GAME_CONFIG;

/**
 * POST /api/auth/check-availability
 * Body: { email?: string, name?: string } — at least one required.
 * Server-side only; CSRF required (dashboard POST APIs).
 */
export async function POST(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const ip = getClientIP(request);
  const rl = checkAuthRouteRateLimit(
    ip,
    "auth_check_availability",
    AUTH_API.CHECK_AVAILABILITY_MAX_PER_WINDOW,
    AUTH_API.CHECK_AVAILABILITY_WINDOW_MS
  );
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: rl.retryAfterSec ? { "Retry-After": String(rl.retryAfterSec) } : undefined,
      }
    );
  }

  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim().toLowerCase() : "";

  if (!email && !name) {
    return NextResponse.json({ error: "Provide email or name" }, { status: 400 });
  }

  const admin = getAuthAdminClient();
  const result = {};

  if (email) {
    const { data } = await admin.from("profiles").select("id").ilike("email", email).limit(1);
    result.emailTaken = (data?.length || 0) > 0;
  }

  if (name) {
    const { data } = await admin.from("profiles").select("id").ilike("full_name", name).limit(1);
    result.nameTaken = (data?.length || 0) > 0;
  }

  return NextResponse.json(result);
}
