import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { getAuthAdminClient } from "@/lib/supabase";
import { logAction } from "@/lib/audit";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";
import { validatePasswordStrength } from "@/lib/auth/password";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  try {
    const hostErr = rejectIfNotDashboardHost(request);
    if (hostErr) return hostErr;

    const guard = await requireRole(100); // owner only
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

    const { userId, newPassword } = body;

    if (!userId || !UUID_RE.test(userId)) {
      return NextResponse.json({ error: "Missing or invalid userId" }, { status: 400 });
    }

    const pwErrors = validatePasswordStrength(newPassword);
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

    const { error: updateError } = await admin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (updateError) {
      console.error("[reset-user-password]", updateError.message);
      return NextResponse.json({ error: "Failed to update password." }, { status: 500 });
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
