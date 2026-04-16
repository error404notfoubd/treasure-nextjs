import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { getAuthAdminClient } from "@/lib/supabase";
import { canToggleVerifiedLeadNotifications } from "@/lib/roles";
import { logAction } from "@/lib/audit";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH /api/users/notification-preference — { userId, receiveVerifiedLeadNotifications: boolean }
export async function PATCH(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const guard = await requirePermission("manage_dashboard_users");
  if (guard.error) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, receiveVerifiedLeadNotifications } = body;
  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Missing or invalid userId" }, { status: 400 });
  }
  if (typeof receiveVerifiedLeadNotifications !== "boolean") {
    return NextResponse.json({ error: "receiveVerifiedLeadNotifications must be a boolean" }, { status: 400 });
  }

  const admin = getAuthAdminClient();
  const { data: target, error: fetchErr } = await admin
    .from("profiles")
    .select("id, role, receive_verified_lead_notifications, full_name, email")
    .eq("id", userId)
    .single();

  if (fetchErr || !target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!canToggleVerifiedLeadNotifications(guard.user.role, target.role)) {
    return NextResponse.json(
      { error: "You can only change this setting for editors and viewers, or any role if you are an owner." },
      { status: 403 }
    );
  }

  const prev = !!target.receive_verified_lead_notifications;
  if (prev === receiveVerifiedLeadNotifications) {
    return NextResponse.json({ data: target });
  }

  const { data, error } = await admin
    .from("profiles")
    .update({ receive_verified_lead_notifications: receiveVerifiedLeadNotifications })
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    console.error("[users/notification-preference PATCH]", error.message);
    return NextResponse.json({ error: "Failed to update preference." }, { status: 500 });
  }

  await logAction({
    table: "profiles",
    operation: "UPDATE",
    rowId: userId,
    oldData: { receive_verified_lead_notifications: prev },
    newData: { receive_verified_lead_notifications: receiveVerifiedLeadNotifications },
    subjectHint: target.full_name || target.email || undefined,
    actor: guard.user.fullName || guard.user.email,
    actorRole: guard.user.role,
  });

  return NextResponse.json({ data });
}
