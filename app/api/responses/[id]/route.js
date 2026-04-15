import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { getDataClient } from "@/lib/supabase";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";
import {
  FUNNEL_USERS_TABLE,
  mapUserRowForDashboard,
  isFunnelUserId,
} from "@/lib/funnel-users";

// GET /api/responses/[id] — full funnel user row for dashboard detail modal
export async function GET(request, context) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const guard = await requirePermission("view_leads");
  if (guard.error) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const params = await Promise.resolve(context.params);
  const id = typeof params?.id === "string" ? params.id : "";
  if (!isFunnelUserId(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDataClient();
  const { data: row, error } = await db.from(FUNNEL_USERS_TABLE).select("*").eq("user_id", id).maybeSingle();

  if (error) {
    console.error("[responses GET id]", error.message);
    return NextResponse.json({ error: "Failed to load record." }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const favoriteGameNames = {};
  if (row.favorite_game_id) {
    const { data: fg } = await db.from("favorite_games").select("id, name").eq("id", row.favorite_game_id).maybeSingle();
    if (fg?.id) favoriteGameNames[fg.id] = fg.name;
  }

  return NextResponse.json({ data: mapUserRowForDashboard(row, favoriteGameNames) });
}
