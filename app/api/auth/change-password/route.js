import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSessionUser } from "@/lib/auth/session";
import { getAuthAdminClient } from "@/lib/supabase";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";
import { validatePasswordStrength } from "@/lib/auth/password";

const attempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_STORE_SIZE = 5_000;
let lastCleanup = Date.now();

function isRateLimited(userId) {
  const now = Date.now();

  if (now - lastCleanup > 60_000) {
    lastCleanup = now;
    for (const [key, record] of attempts) {
      if (now - record.start > WINDOW_MS) attempts.delete(key);
    }
  }

  const record = attempts.get(userId);

  if (!record || now - record.start > WINDOW_MS) {
    if (attempts.size >= MAX_STORE_SIZE) {
      const oldest = attempts.keys().next().value;
      attempts.delete(oldest);
    }
    attempts.set(userId, { count: 1, start: now });
    return false;
  }

  record.count++;
  return record.count > MAX_ATTEMPTS;
}

export async function POST(request) {
  try {
    const hostErr = rejectIfNotDashboardHost(request);
    if (hostErr) return hostErr;

    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (isRateLimited(user.id)) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again in 15 minutes." },
        { status: 429 }
      );
    }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required" },
        { status: 400 }
      );
    }

    const pwErrors = validatePasswordStrength(newPassword);
    if (pwErrors.length > 0) {
      return NextResponse.json(
        { error: pwErrors[0] },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "New password must be different from current password" },
        { status: 400 }
      );
    }

    // Verify current password with a stateless client
    const verifier = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { error: signInError } = await verifier.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 }
      );
    }

    // Update password via admin client
    const admin = getAuthAdminClient();
    const { error: updateError } = await admin.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error("[change-password]", updateError.message);
      return NextResponse.json(
        { error: "Failed to update password." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[change-password]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
