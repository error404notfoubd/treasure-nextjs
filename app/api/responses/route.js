import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { getPermissionGrants, hasPermission } from "@/lib/permission-grants";
import { getDataClient } from "@/lib/supabase";
import { logAction } from "@/lib/audit";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";
import {
  FUNNEL_USERS_TABLE,
  FUNNEL_USER_LIST_SELECT,
  mapUserRowForDashboard,
  mapUserRowForList,
  persistUserPhone,
  persistUserEmail,
  isFunnelUserId,
} from "@/lib/funnel-users";
import { phoneHash, emailHash } from "@/lib/survey/contact-storage";
import { toE164 } from "@/lib/phoneE164";

const MAX_LIMIT = 100;

function sanitizeSearch(raw) {
  return raw.replace(/[^a-zA-Z0-9@.+ -]/g, "").trim().slice(0, 200);
}

// GET /api/responses?page=0&limit=15&search=...&flagged=true&pool=leads|customers
export async function GET(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const guard = await requirePermission("view_leads");
  if (guard.error) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get("page") || "0") || 0);
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "15") || 15), MAX_LIMIT);
  const search = sanitizeSearch(searchParams.get("search") || "");
  const flaggedOnly = searchParams.get("flagged") === "true";
  const poolRaw = (searchParams.get("pool") || "leads").toLowerCase();
  if (poolRaw !== "leads" && poolRaw !== "customers") {
    return NextResponse.json({ error: "pool must be leads or customers" }, { status: 400 });
  }
  const pool = poolRaw;

  const db = getDataClient();

  let namePattern = null;
  let emailH = null;
  let phoneH = null;
  if (search) {
    const esc = search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    namePattern = `%${esc}%`;
    if (search.includes("@")) {
      const eh = emailHash(search);
      if (eh) emailH = eh;
    }
    const e164Guess = toE164(search);
    if (e164Guess) {
      const ph = phoneHash(e164Guess);
      if (ph) phoneH = ph;
    }
  }

  const rpcPageArgs = {
    p_pool: pool,
    p_limit: limit,
    p_offset: page * limit,
    p_flagged_only: flaggedOnly,
    p_name_pattern: namePattern,
    p_email_hash: emailH,
    p_phone_hash: phoneH,
  };
  const rpcCountArgs = {
    p_pool: pool,
    p_flagged_only: flaggedOnly,
    p_name_pattern: namePattern,
    p_email_hash: emailH,
    p_phone_hash: phoneH,
  };

  const [{ data: idRows, error: rpcErr }, { data: countRaw, error: countErr }] = await Promise.all([
    db.rpc("fn_pool_user_ids_page", rpcPageArgs),
    db.rpc("fn_pool_user_ids_count", rpcCountArgs),
  ]);

  if (rpcErr || countErr) {
    console.error("[responses GET rpc]", rpcErr?.message || countErr?.message);
    return NextResponse.json(
      {
        error:
          "Lead pool is not available. Run sql/migrations/20260416_leads_customers_pool.sql (and prior bonus/contacted migration if needed).",
      },
      { status: 503 }
    );
  }

  const total = typeof countRaw === "number" ? countRaw : Number(countRaw) || 0;
  const ids = (idRows || [])
    .map((r) => (r && typeof r === "object" ? r.user_id : r))
    .filter((x) => typeof x === "string" && isFunnelUserId(x));

  if (ids.length === 0) {
    return NextResponse.json({ data: [], total });
  }

  const { data: userRows, error: uErr } = await db
    .from(FUNNEL_USERS_TABLE)
    .select(FUNNEL_USER_LIST_SELECT)
    .in("user_id", ids);
  if (uErr) {
    console.error("[responses GET users]", uErr.message);
    return NextResponse.json({ error: "Failed to load responses." }, { status: 500 });
  }

  const order = new Map(ids.map((uid, i) => [uid, i]));
  const rows = (userRows || []).sort((a, b) => (order.get(a.user_id) ?? 0) - (order.get(b.user_id) ?? 0));
  const gameIds = [...new Set(rows.map((r) => r.favorite_game_id).filter((x) => typeof x === "string" && x))];
  const favoriteGameNames = {};
  if (gameIds.length > 0) {
    const { data: fgRows, error: fgErr } = await db.from("favorite_games").select("id, name").in("id", gameIds);
    if (!fgErr && Array.isArray(fgRows)) {
      for (const g of fgRows) {
        if (g?.id) favoriteGameNames[g.id] = g.name;
      }
    }
  }

  return NextResponse.json({
    data: rows.map((r) => mapUserRowForList(r, favoriteGameNames)),
    total,
  });
}

const MAX_NOTE_LEN = 8000;
const MAX_FIELD_LEN = 500;

// PATCH /api/responses — { id: user_id uuid, updates }
export async function PATCH(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const guard = await requirePermission("edit_leads");
  if (guard.error) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { id, updates } = body;
  if (!id || !isFunnelUserId(id)) {
    return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
  }
  if (!updates || typeof updates !== "object") return NextResponse.json({ error: "Missing updates" }, { status: 400 });

  const db = getDataClient();

  const { data: oldRow, error: oldErr } = await db
    .from(FUNNEL_USERS_TABLE)
    .select("*")
    .eq("user_id", id)
    .single();

  if (oldErr || !oldRow) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  const safe = {};
  const BOOLEAN_LEAD_FIELDS = new Set(["is_flagged", "bonus_granted", "contacted"]);
  const allowed = [
    "full_name",
    "name",
    "email",
    "phone",
    "frequency",
    "heard_from",
    "is_flagged",
    "notes",
    "bonus_granted",
    "contacted",
  ];
  for (const key of allowed) {
    if (updates[key] === undefined) continue;
    if (BOOLEAN_LEAD_FIELDS.has(key)) {
      if (typeof updates[key] !== "boolean") {
        return NextResponse.json({ error: `"${key}" must be a boolean` }, { status: 422 });
      }
      safe[key] = updates[key];
      continue;
    }
    if (updates[key] !== null && typeof updates[key] !== "string") {
      return NextResponse.json({ error: `Field "${key}" must be a string or null` }, { status: 422 });
    }
    const raw = updates[key] === null ? null : updates[key].trim();
    const maxLen = key === "notes" ? MAX_NOTE_LEN : MAX_FIELD_LEN;
    if (raw !== null && raw.length > maxLen) {
      return NextResponse.json({ error: `Field "${key}" is too long` }, { status: 422 });
    }
    if (key === "name") {
      safe.full_name = raw;
      continue;
    }
    if (key === "full_name") {
      safe.full_name = raw;
      continue;
    }
    if (key === "heard_from") {
      safe.heard_from = raw && raw.length ? raw : null;
      continue;
    }
    safe[key] = raw;
  }

  if (safe.phone !== undefined) {
    const e164 = toE164(safe.phone);
    if (!e164) {
      return NextResponse.json({ error: "phone must be a valid E.164 number" }, { status: 422 });
    }
    Object.assign(safe, persistUserPhone(e164));
    delete safe.phone;
  }

  if (safe.email !== undefined) {
    const em =
      safe.email === null || safe.email === ""
        ? persistUserEmail(null)
        : persistUserEmail(String(safe.email));
    safe.email_encrypted = em.email_encrypted;
    safe.email_hash = em.email_hash;
    delete safe.email;
  }

  if (updates.verified !== undefined) {
    const grants = await getPermissionGrants();
    if (!hasPermission(grants, guard.user.role, "verify_leads")) {
      return NextResponse.json({ error: "You do not have permission to change verification status." }, { status: 403 });
    }
    if (typeof updates.verified !== "boolean") {
      return NextResponse.json({ error: "verified must be a boolean" }, { status: 422 });
    }
    const now = new Date().toISOString();
    if (updates.verified) {
      safe.verified_at = now;
      safe.registration_step = "verified";
    } else {
      safe.verified_at = null;
      safe.registration_step = "submitted";
    }
  }

  if (updates.contacted === false) {
    safe.bonus_granted = false;
  }

  const mergedContacted =
    safe.contacted !== undefined ? !!safe.contacted : !!oldRow.contacted;
  const mergedBonus =
    safe.bonus_granted !== undefined ? !!safe.bonus_granted : !!oldRow.bonus_granted;

  if (mergedBonus && !mergedContacted) {
    return NextResponse.json(
      { error: "Bonus cannot be granted until the lead is marked contacted." },
      { status: 422 }
    );
  }

  safe.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from(FUNNEL_USERS_TABLE)
    .update(safe)
    .eq("user_id", id)
    .select()
    .single();

  if (error) {
    console.error("[responses PATCH]", error.message);
    return NextResponse.json({ error: "Failed to update response." }, { status: 500 });
  }

  await logAction({
    table: FUNNEL_USERS_TABLE,
    operation: "UPDATE",
    rowId: id,
    oldData: oldRow,
    newData: data,
    actor: guard.user.fullName || guard.user.email,
    actorRole: guard.user.role,
  });

  const favMap = {};
  if (data?.favorite_game_id) {
    const { data: fg } = await db.from("favorite_games").select("id, name").eq("id", data.favorite_game_id).maybeSingle();
    if (fg?.id) favMap[fg.id] = fg.name;
  }

  return NextResponse.json({ data: mapUserRowForDashboard(data, favMap) });
}

// DELETE /api/responses — { id: user_id uuid }
export async function DELETE(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const guard = await requirePermission("delete_leads");
  if (guard.error) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { id } = body;
  if (!id || !isFunnelUserId(id)) {
    return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
  }

  const db = getDataClient();

  const { data: oldRow } = await db
    .from(FUNNEL_USERS_TABLE)
    .select("*")
    .eq("user_id", id)
    .single();

  const { error } = await db.from(FUNNEL_USERS_TABLE).delete().eq("user_id", id);

  if (error) {
    console.error("[responses DELETE]", error.message);
    return NextResponse.json({ error: "Failed to delete response." }, { status: 500 });
  }

  await logAction({
    table: FUNNEL_USERS_TABLE,
    operation: "DELETE",
    rowId: id,
    oldData: oldRow,
    newData: null,
    actor: guard.user.fullName || guard.user.email,
    actorRole: guard.user.role,
  });

  return NextResponse.json({ success: true });
}
