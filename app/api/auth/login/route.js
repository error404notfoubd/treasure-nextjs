import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";
import { getAuthAdminClient } from "@/lib/supabase";
import { getClientIP } from "@/lib/ip";
import { checkAuthRouteRateLimit } from "@/lib/auth/route-rate-limit";
import GAME_CONFIG from "@/lib/config";

const { AUTH_API } = GAME_CONFIG;

export async function POST(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const ip = getClientIP(request);
  const rl = checkAuthRouteRateLimit(
    ip,
    "auth_login",
    AUTH_API.LOGIN_RATE_LIMIT_MAX_PER_WINDOW,
    AUTH_API.LOGIN_RATE_LIMIT_WINDOW_MS
  );
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please wait and try again." },
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

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 422 });
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { session, user },
    error: signError,
  } = await supabase.auth.signInWithPassword({ email, password });

  if (signError || !session || !user) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  }

  const admin = getAuthAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return NextResponse.json(
      {
        error:
          "This account is not provisioned for the dashboard. Contact an administrator.",
      },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}
