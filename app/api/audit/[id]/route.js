import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { getDataClient } from "@/lib/supabase";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";

// GET /api/audit/[id] — single audit_log row including old_data / new_data
export async function GET(request, context) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const guard = await requirePermission("view_audit");
  if (guard.error) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const params = await Promise.resolve(context.params);
  const raw = params?.id;
  const id = typeof raw === "string" ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(id) || id < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDataClient();
  const { data, error } = await db.from("audit_log").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error("[audit GET id]", error.message);
    return NextResponse.json({ error: "Failed to load audit entry." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data });
}
