import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { getAuthAdminClient } from "@/lib/supabase";
import { logAction } from "@/lib/audit";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/users/requests — list pending signup requests
export async function GET(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const guard = await requirePermission("approve_signups");
  if (guard.error) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const admin = getAuthAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[users/requests GET]", error.message);
    return NextResponse.json({ error: "Failed to load requests." }, { status: 500 });
  }
  return NextResponse.json({ data });
}

// PATCH /api/users/requests — approve or reject { userId, action: "approve"|"reject" }
export async function PATCH(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const guard = await requirePermission("approve_signups");
  if (guard.error) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { userId, action } = body;

  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Missing or invalid userId" }, { status: 400 });
  }
  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Action must be 'approve' or 'reject'" }, { status: 400 });
  }

  const admin = getAuthAdminClient();

  const { data: target, error: fetchErr } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (fetchErr || !target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (action === "reject") {
    if (target.status !== "pending") {
      return NextResponse.json(
        { error: "Only pending sign-up requests can be rejected." },
        { status: 400 }
      );
    }
  }

  if (action === "approve") {
    if (target.status === "approved") {
      return NextResponse.json({ error: "User is already approved" }, { status: 400 });
    }
    if (target.status !== "pending" && target.status !== "rejected") {
      return NextResponse.json(
        { error: "Only pending or rejected accounts can be approved." },
        { status: 400 }
      );
    }
  }

  const newStatus = action === "approve" ? "approved" : "rejected";

  const { data, error } = await admin
    .from("profiles")
    .update({ status: newStatus })
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    console.error("[users/requests PATCH]", error.message);
    return NextResponse.json({ error: "Failed to update request." }, { status: 500 });
  }

  await logAction({
    table: "profiles",
    operation: action === "approve" ? "APPROVE" : "REJECT",
    rowId: userId,
    oldData: { status: target.status, email: target.email, full_name: target.full_name },
    newData: { status: newStatus, email: target.email, full_name: target.full_name },
    actor: guard.user.fullName || guard.user.email,
    actorRole: guard.user.role,
  });

  return NextResponse.json({ data });
}
