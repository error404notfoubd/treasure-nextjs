import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { getDataClient } from "@/lib/supabase";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";
import { FUNNEL_USERS_TABLE } from "@/lib/funnel-users";

// GET /api/responses/stats
export async function GET(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const guard = await requirePermission("view_leads");
  if (guard.error) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const db = getDataClient();
  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  const [totalRes, flaggedRes, todayRes, verifiedRes] = await Promise.all([
    db.from(FUNNEL_USERS_TABLE).select("user_id", { count: "exact", head: true }),
    db.from(FUNNEL_USERS_TABLE).select("user_id", { count: "exact", head: true }).eq("is_flagged", true),
    db
      .from(FUNNEL_USERS_TABLE)
      .select("user_id", { count: "exact", head: true })
      .gte("created_at", startOfDay),
    db.from(FUNNEL_USERS_TABLE).select("user_id", { count: "exact", head: true }).not("verified_at", "is", null),
  ]);

  return NextResponse.json({
    total: totalRes.count || 0,
    flagged: flaggedRes.count || 0,
    today: todayRes.count || 0,
    verified: verifiedRes.count || 0,
  });
}
