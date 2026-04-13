import { NextResponse } from "next/server";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";
import { requireOwner, requirePermission } from "@/lib/auth/session";
import { getAuthAdminClient } from "@/lib/supabase";
import {
  invalidatePermissionGrantCache,
  getPermissionGrants,
  parsePermissionGrantsPatch,
  applyImmutableOwnerRoleGrants,
} from "@/lib/permission-grants";
import { PERMISSION_CATALOG, PERMISSION_KEYS } from "@/lib/permissions-catalog";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

/** GET — anyone who can manage dashboard users (read matrix for role cards); same payload for owners on the permissions tab. */
export async function GET(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const guard = await requirePermission("manage_dashboard_users");
  if (guard.error) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const grants = await getPermissionGrants();
  return NextResponse.json({ catalog: PERMISSION_CATALOG, grants });
}

/** PATCH — owner only; body `{ grants: { [permission_key]: string[] } }` */
export async function PATCH(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const guard = await requireOwner();
  if (guard.error) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
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

  const parsed = parsePermissionGrantsPatch(body);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid grants: expected grants object with each permission key mapped to an array of roles." },
      { status: 422 }
    );
  }

  const grants = applyImmutableOwnerRoleGrants(parsed);

  const admin = getAuthAdminClient();
  const { data: before } = await admin.from("role_permission_grants").select("permission_key, role");

  const { error: delErr } = await admin.from("role_permission_grants").delete().in("permission_key", PERMISSION_KEYS);
  if (delErr) {
    console.error("[permission-grants PATCH delete]", delErr.message);
    return NextResponse.json({ error: "Failed to clear role grants." }, { status: 500 });
  }

  const rows = [];
  for (const [permission_key, roles] of Object.entries(grants)) {
    for (const role of roles) {
      rows.push({ permission_key, role });
    }
  }

  if (rows.length > 0) {
    const { error: insErr } = await admin.from("role_permission_grants").insert(rows);
    if (insErr) {
      console.error("[permission-grants PATCH insert]", insErr.message);
      return NextResponse.json({ error: "Failed to save role grants." }, { status: 500 });
    }
  }

  invalidatePermissionGrantCache();

  await logAction({
    table: "role_permission_grants",
    operation: "UPDATE",
    rowId: "all",
    oldData: before || null,
    newData: grants,
    actor: guard.user.fullName || guard.user.email,
    actorRole: guard.user.role,
  });

  return NextResponse.json({ grants });
}
