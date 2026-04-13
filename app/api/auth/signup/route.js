import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";
import { getClientIP } from "@/lib/ip";
import { checkAuthRouteRateLimit } from "@/lib/auth/route-rate-limit";
import { validatePasswordStrength } from "@/lib/auth/password";
import { getAppSettings } from "@/lib/settings/app-settings";
import { getAuthAdminClient } from "@/lib/supabase";
import { dashboardOriginFromRequest } from "@/lib/auth/dashboard-origin";

export async function POST(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const auth = await getAppSettings();
  const ip = getClientIP(request);
  const rl = checkAuthRouteRateLimit(
    ip,
    "auth_signup",
    auth.signupRateLimitMaxPerWindow,
    auth.signupRateLimitWindowMs
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
  const pwErrors = validatePasswordStrength(password, auth.passwordMinLength);
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

  const origin = dashboardOriginFromRequest(request);
  const emailRedirectTo = origin ? `${origin}/login` : undefined;

  const { data, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
      data: {
        full_name: fullName,
      },
    },
  });

  if (authError) {
    console.error("[signup]", authError.message);
    const msg = authError.message || "";
    if (/already registered|already been registered|user already registered/i.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (/confirmation email|error sending.*email|smtp|mail delivery/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            "Supabase could not send the confirmation email. In the Supabase dashboard: Authentication → Providers → Email — set up SMTP (or use a test inbox), check rate limits, and ensure “Confirm email” is appropriate for your environment. For local dev you can disable “Confirm email” under Email provider settings.",
          code: "email_confirmation_failed",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Could not create account. Please try again." }, { status: 400 });
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

  // Profile role comes only from server settings (DB trigger always inserts viewer).
  const admin = getAuthAdminClient();
  const { error: profileRoleError } = await admin
    .from("profiles")
    .update({ role: auth.defaultSignupRole })
    .eq("id", data.user.id);

  if (profileRoleError) {
    console.error("[signup] profile role", profileRoleError.message);
    return NextResponse.json(
      { error: "Account was created but could not be finalized. Please contact support." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
