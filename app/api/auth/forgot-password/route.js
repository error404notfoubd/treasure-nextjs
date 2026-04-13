import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rejectIfNotDashboardHost, hostBareFromRequest } from "@/lib/dashboard/api-host";
import { dashboardOriginFromRequest } from "@/lib/auth/dashboard-origin";
import { getClientIP } from "@/lib/ip";
import { checkAuthRouteRateLimit } from "@/lib/auth/route-rate-limit";
import { getAppSettings } from "@/lib/settings/app-settings";

const EMAIL_MAX = 320;

export async function POST(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const auth = await getAppSettings();
  const ip = getClientIP(request);
  const rl = checkAuthRouteRateLimit(
    ip,
    "auth_forgot_password",
    auth.loginRateLimitMaxPerWindow,
    auth.loginRateLimitWindowMs
  );
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests. Please wait and try again." },
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
  if (!email || email.length > EMAIL_MAX) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 422 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 422 });
  }

  const origin = dashboardOriginFromRequest(request);
  if (!origin) {
    return NextResponse.json({ error: "Could not determine site URL." }, { status: 500 });
  }

  const redirectTo = `${origin}/auth/reset-password`;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    console.error("[forgot-password]", hostBareFromRequest(request), error.message);
  }

  return NextResponse.json({
    ok: true,
    message:
      "If an account exists for that email, you will receive a link to reset your password shortly.",
  });
}
