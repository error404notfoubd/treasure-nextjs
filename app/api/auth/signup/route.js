import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";
import { getClientIP } from "@/lib/ip";
import { checkAuthRouteRateLimit } from "@/lib/auth/route-rate-limit";
import { validatePasswordStrength } from "@/lib/auth/password";
import GAME_CONFIG from "@/lib/config";

const { AUTH_API } = GAME_CONFIG;

export async function POST(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const ip = getClientIP(request);
  const rl = checkAuthRouteRateLimit(
    ip,
    "auth_signup",
    AUTH_API.SIGNUP_RATE_LIMIT_MAX_PER_WINDOW,
    AUTH_API.SIGNUP_RATE_LIMIT_WINDOW_MS
  );
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many signup attempts from this network. Please try again later." },
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

  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!fullName || !email || !password) {
    return NextResponse.json({ error: "Full name, email, and password are required." }, { status: 422 });
  }
  const pwErrors = validatePasswordStrength(password);
  if (pwErrors.length > 0) {
    return NextResponse.json(
      { error: pwErrors[0] },
      { status: 422 }
    );
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

  const { data, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: AUTH_API.DEFAULT_SIGNUP_ROLE,
      },
    },
  });

  if (authError) {
    console.error("[signup]", authError.message);
    const safeMsg = authError.message?.includes("already registered")
      ? authError.message
      : "Could not create account. Please try again.";
    return NextResponse.json({ error: safeMsg }, { status: 400 });
  }

  if (!data?.user) {
    return NextResponse.json(
      {
        error: "Could not create account. Try again, or sign in if you already have an account.",
      },
      { status: 400 }
    );
  }

  if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return NextResponse.json(
      { error: "This email is already registered.", code: "email_taken" },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
