import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { getDataClient } from "@/lib/supabase";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";

const MAX_LIMIT = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Allow only safe alphanumeric, space, @, and dot for search
function sanitizeAuditSearch(raw) {
  return raw.replace(/[^a-zA-Z0-9@. -]/g, "").trim().slice(0, 200);
}

// GET /api/audit?limit=50
export async function GET(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const guard = await requireRole(80); // admin+
  if (guard.error) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50") || 50), MAX_LIMIT);
  const userIdRaw = searchParams.get("userId");
  const userNameRaw = searchParams.get("userName");

  if (userIdRaw && !UUID_RE.test(userIdRaw.trim())) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  const userId = userIdRaw?.trim();
  const userName = userNameRaw ? sanitizeAuditSearch(userNameRaw) : "";

  const db = getDataClient();
  let query = db
    .from("audit_log")
    .select("*")
    .order("performed_at", { ascending: false })
    .limit(limit);

  if (userId && userName) {
    query = query.or(`row_id.eq.${userId},performed_by.ilike.${userName}%`);
  } else if (userId) {
    query = query.eq("row_id", userId);
  } else if (userName) {
    query = query.ilike("performed_by", `${userName}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[audit GET]", error.message);
    return NextResponse.json({ error: "Failed to load audit log." }, { status: 500 });
  }
  return NextResponse.json({ data });
}
