import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getPermissionKeysForRole } from "@/lib/permission-grants";
import { getAuthAdminClient, getDataClient } from "@/lib/supabase";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";

/** GET /api/dashboard/nav-counts — counts for sidebar (Leads, Customers, Games, pending Requests). */
export async function GET(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const user = await getSessionUser();
  if (!user || user.status !== "approved") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keys = await getPermissionKeysForRole(user.role);
  const keySet = new Set(keys);
  const db = getDataClient();
  const out = { leads: null, customers: null, games: null, requests: null };

  if (keySet.has("view_leads")) {
    const emptyRpc = {
      p_flagged_only: false,
      p_name_pattern: null,
      p_email_hash: null,
      p_phone_hash: null,
    };
    const [leadsRes, customersRes] = await Promise.all([
      db.rpc("fn_pool_user_ids_count", { p_pool: "leads", ...emptyRpc }),
      db.rpc("fn_pool_user_ids_count", { p_pool: "customers", ...emptyRpc }),
    ]);
    if (!leadsRes.error && leadsRes.data != null) {
      out.leads = typeof leadsRes.data === "number" ? leadsRes.data : Number(leadsRes.data) || 0;
    }
    if (!customersRes.error && customersRes.data != null) {
      out.customers = typeof customersRes.data === "number" ? customersRes.data : Number(customersRes.data) || 0;
    }
  }

  if (keySet.has("manage_games_list")) {
    const { count, error } = await db.from("favorite_games").select("id", { count: "exact", head: true });
    if (!error && count != null) out.games = count;
  }

  if (keySet.has("approve_signups")) {
    const admin = getAuthAdminClient();
    const { count, error } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (!error && count != null) out.requests = count;
  }

  return NextResponse.json(out);
}
