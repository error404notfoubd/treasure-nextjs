import { NextResponse } from "next/server";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";
import { requirePermission } from "@/lib/auth/session";
import { getDataClient } from "@/lib/supabase";
import { logAction } from "@/lib/audit";
import { isValidUuid } from "@/lib/survey/uuid";

export const runtime = "nodejs";

const NAME_MIN = 1;
const NAME_MAX = 120;

async function guard(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;
  const g = await requirePermission("manage_games_list");
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status });
  return g;
}

/** GET — full catalog (active + inactive) for dashboard management. */
export async function GET(request) {
  const g = await guard(request);
  if (g instanceof NextResponse) return g;

  const db = getDataClient();
  const { data, error } = await db
    .from("favorite_games")
    .select("id, name, sort_order, is_active, created_at")
    .order("sort_order", { ascending: true });

  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json(
        { error: "Table favorite_games does not exist. Run database migrations." },
        { status: 503 }
      );
    }
    console.error("[dashboard/favorite-games GET]", error.message);
    return NextResponse.json({ error: "Failed to load games." }, { status: 500 });
  }

  return NextResponse.json({ games: data ?? [] });
}

/** POST — add a game: `{ name, sort_order? }` */
export async function POST(request) {
  const g = await guard(request);
  if (g instanceof NextResponse) return g;

  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return NextResponse.json({ error: `Name must be between ${NAME_MIN} and ${NAME_MAX} characters.` }, { status: 422 });
  }

  let sortOrder = 0;
  if (body.sort_order !== undefined && body.sort_order !== null) {
    const n = parseInt(String(body.sort_order), 10);
    if (!Number.isFinite(n) || n < -999999 || n > 999999) {
      return NextResponse.json({ error: "sort_order must be a reasonable integer." }, { status: 422 });
    }
    sortOrder = n;
  } else {
    const db = getDataClient();
    const { data: maxRow } = await db
      .from("favorite_games")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = (maxRow?.sort_order ?? 0) + 10;
  }

  const db = getDataClient();
  const { data, error } = await db
    .from("favorite_games")
    .insert({ name, sort_order: sortOrder, is_active: true })
    .select("id, name, sort_order, is_active, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A game with this name already exists." }, { status: 409 });
    }
    console.error("[dashboard/favorite-games POST]", error.message);
    return NextResponse.json({ error: "Could not create game." }, { status: 500 });
  }

  await logAction({
    table: "favorite_games",
    operation: "INSERT",
    rowId: data.id,
    oldData: null,
    newData: data,
    actor: g.user.fullName || g.user.email,
    actorRole: g.user.role,
  });

  return NextResponse.json({ game: data }, { status: 201 });
}

/** PATCH — update one row: `{ id, name?, sort_order?, is_active? }` */
export async function PATCH(request) {
  const g = await guard(request);
  if (g instanceof NextResponse) return g;

  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  /** Bulk reorder: `{ ordered_ids: string[] }` — assigns sort_order 10, 20, … by array position. */
  if (Array.isArray(body.ordered_ids)) {
    const ids = body.ordered_ids;
    if (ids.length === 0) {
      return NextResponse.json({ error: "ordered_ids must be a non-empty array." }, { status: 422 });
    }
    if (ids.some((x) => typeof x !== "string" || !isValidUuid(x.trim()))) {
      return NextResponse.json({ error: "Each ordered_ids entry must be a valid UUID." }, { status: 422 });
    }
    const trimmed = ids.map((x) => x.trim());
    if (new Set(trimmed).size !== trimmed.length) {
      return NextResponse.json({ error: "ordered_ids must not contain duplicates." }, { status: 422 });
    }

    const db = getDataClient();
    const { data: allRows, error: selErr } = await db.from("favorite_games").select("id, sort_order, name, is_active, created_at");
    if (selErr) {
      console.error("[dashboard/favorite-games PATCH reorder select]", selErr.message);
      return NextResponse.json({ error: "Failed to load games for reorder." }, { status: 500 });
    }
    const rows = allRows ?? [];
    if (rows.length !== trimmed.length) {
      return NextResponse.json(
        { error: "ordered_ids must list every game exactly once (same count as the catalog)." },
        { status: 422 }
      );
    }
    const dbIdSet = new Set(rows.map((r) => r.id));
    if (trimmed.some((id) => !dbIdSet.has(id))) {
      return NextResponse.json({ error: "ordered_ids contains an unknown game id." }, { status: 422 });
    }

    const oldOrder = rows.map((r) => ({ id: r.id, sort_order: r.sort_order }));
    const updates = trimmed.map((id, i) =>
      db.from("favorite_games").update({ sort_order: (i + 1) * 10 }).eq("id", id)
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error("[dashboard/favorite-games PATCH reorder]", failed.error.message);
      return NextResponse.json({ error: "Could not save new order." }, { status: 500 });
    }

    const { data: refreshed, error: refErr } = await db
      .from("favorite_games")
      .select("id, name, sort_order, is_active, created_at")
      .order("sort_order", { ascending: true });
    if (refErr) {
      console.error("[dashboard/favorite-games PATCH reorder refetch]", refErr.message);
      return NextResponse.json({ error: "Order saved but reload failed." }, { status: 500 });
    }

    await logAction({
      table: "favorite_games",
      operation: "UPDATE",
      rowId: "reorder",
      oldData: { order: oldOrder },
      newData: { ordered_ids: trimmed },
      actor: g.user.fullName || g.user.email,
      actorRole: g.user.role,
    });

    return NextResponse.json({ games: refreshed ?? [] });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Missing or invalid id." }, { status: 400 });
  }

  const patch = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return NextResponse.json({ error: "name must be a string." }, { status: 422 });
    }
    const name = body.name.trim();
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      return NextResponse.json({ error: `Name must be between ${NAME_MIN} and ${NAME_MAX} characters.` }, { status: 422 });
    }
    patch.name = name;
  }
  if (body.sort_order !== undefined && body.sort_order !== null) {
    const n = parseInt(String(body.sort_order), 10);
    if (!Number.isFinite(n) || n < -999999 || n > 999999) {
      return NextResponse.json({ error: "sort_order must be a reasonable integer." }, { status: 422 });
    }
    patch.sort_order = n;
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json({ error: "is_active must be a boolean." }, { status: 422 });
    }
    patch.is_active = body.is_active;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No updates provided." }, { status: 422 });
  }

  const db = getDataClient();

  const { data: oldRow } = await db.from("favorite_games").select("*").eq("id", id).maybeSingle();
  if (!oldRow) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const { data, error } = await db
    .from("favorite_games")
    .update(patch)
    .eq("id", id)
    .select("id, name, sort_order, is_active, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A game with this name already exists." }, { status: 409 });
    }
    console.error("[dashboard/favorite-games PATCH]", error.message);
    return NextResponse.json({ error: "Could not update game." }, { status: 500 });
  }

  await logAction({
    table: "favorite_games",
    operation: "UPDATE",
    rowId: id,
    oldData: oldRow,
    newData: data,
    actor: g.user.fullName || g.user.email,
    actorRole: g.user.role,
  });

  return NextResponse.json({ game: data });
}

/** DELETE — remove one catalog row: `?id=<uuid>` */
export async function DELETE(request) {
  const g = await guard(request);
  if (g instanceof NextResponse) return g;

  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get("id");
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Missing or invalid id query parameter." }, { status: 400 });
  }

  const db = getDataClient();
  const { data: oldRow } = await db.from("favorite_games").select("*").eq("id", id).maybeSingle();
  if (!oldRow) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const { error } = await db.from("favorite_games").delete().eq("id", id);
  if (error) {
    console.error("[dashboard/favorite-games DELETE]", error.message);
    return NextResponse.json({ error: "Could not delete game." }, { status: 500 });
  }

  await logAction({
    table: "favorite_games",
    operation: "DELETE",
    rowId: id,
    oldData: oldRow,
    newData: null,
    actor: g.user.fullName || g.user.email,
    actorRole: g.user.role,
  });

  return NextResponse.json({ ok: true });
}
