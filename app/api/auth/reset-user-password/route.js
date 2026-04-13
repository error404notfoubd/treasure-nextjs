import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireOwner } from "@/lib/auth/session";
import { getAuthAdminClient } from "@/lib/supabase";
import { logAction } from "@/lib/audit";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";
import { validatePasswordStrength } from "@/lib/auth/password";
import { getAppSettings } from "@/lib/settings/app-settings";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  try {
    const hostErr = rejectIfNotDashboardHost(request);
    if (hostErr) return hostErr;

    const guard = await requireOwner();
    if (guard.error) return NextResponse.json({ error: guard.error }, { status: guard.status });

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

    const { userId } = body;
    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword.trim() : "";

    if (!userId || !UUID_RE.test(userId)) {
      return NextResponse.json({ error: "Missing or invalid userId" }, { status: 400 });
    }

    const authSettings = await getAppSettings();
    const pwErrors = validatePasswordStrength(newPassword, authSettings.passwordMinLength);
    if (pwErrors.length > 0) {
      return NextResponse.json(
        { error: pwErrors[0] },
        { status: 400 }
      );
    }

    if (userId === guard.user.id) {
      return NextResponse.json(
        { error: "Use the Settings page to change your own password" },
        { status: 400 }
      );
    }

    const admin = getAuthAdminClient();

    // Check target user exists and is not an owner
    const { data: target, error: fetchErr } = await admin
      .from("profiles")
      .select("role, email, full_name")
      .eq("id", userId)
      .single();

    if (fetchErr || !target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (target.role === "owner") {
      return NextResponse.json(
        { error: "Cannot reset another owner's password" },
        { status: 403 }
      );
    }

    const { data: authUserRow, error: authGetErr } = await admin.auth.admin.getUserById(userId);
    if (authGetErr || !authUserRow?.user?.email) {
      console.error("[reset-user-password] getUserById", authGetErr?.message);
      return NextResponse.json(
        { error: "This user has no email/password sign-in in Supabase Auth." },
        { status: 404 }
      );
    }

    const authUser = authUserRow.user;
    const needsEmailConfirm = !authUser.email_confirmed_at;

    // Confirm email only when still unconfirmed so signInWithPassword works when the project
    // has "Confirm email" enabled and the user never completed the signup link.
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: newPassword,
      ...(needsEmailConfirm ? { email_confirm: true } : {}),
    });

    if (updateError) {
      console.error("[reset-user-password]", updateError.message);
      const msg = updateError.message || "";
      const userFacing =
        /password|leaked|weak|breach|policy|characters/i.test(msg) && msg.length < 400
          ? msg
          : "Failed to update password. Check Supabase Authentication → password / leaked-password settings, or try a stronger password.";
      return NextResponse.json({ error: userFacing }, { status: 500 });
    }

    const verifier = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { error: verifyErr } = await verifier.auth.signInWithPassword({
      email: authUser.email,
      password: newPassword,
    });
    await verifier.auth.signOut();

    if (verifyErr) {
      console.error("[reset-user-password] post-update verify failed", verifyErr.message);
      return NextResponse.json(
        {
          error:
            "Supabase accepted the update, but sign-in with the new password failed. Check that this project uses the same SUPABASE_URL and keys as the dashboard, Authentication → Providers → Email is enabled, and (if you use CAPTCHA on sign-in) that server-side password checks are not blocked.",
        },
        { status: 500 }
      );
    }

    await logAction({
      table: "profiles",
      operation: "PASSWORD_RESET",
      rowId: userId,
      oldData: null,
      newData: { email: target.email, full_name: target.full_name },
      actor: guard.user.fullName || guard.user.email,
      actorRole: guard.user.role,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[reset-user-password]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
