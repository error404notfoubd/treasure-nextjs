import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { getPermissionGrants, hasPermission } from "@/lib/permission-grants";
import { getDataClient } from "@/lib/supabase";
import { logAction } from "@/lib/audit";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";
import {
  FUNNEL_USERS_TABLE,
  mapUserRowForDashboard,
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

// GET /api/responses?page=0&limit=15&search=...&flagged=true
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

  const db = getDataClient();
  let query = db
    .from(FUNNEL_USERS_TABLE)
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * limit, page * limit + limit - 1);

  if (search) {
    const esc = search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const namePart = `full_name.ilike.%${esc}%`;
    const parts = [namePart];
    if (search.includes("@")) {
      const eh = emailHash(search);
      if (eh) parts.push(`email_hash.eq.${eh}`);
    }
    const e164Guess = toE164(search);
    if (e164Guess) {
      const ph = phoneHash(e164Guess);
      if (ph) parts.push(`phone_hash.eq.${ph}`);
    }
    query = query.or(parts.join(","));
  }
  if (flaggedOnly) {
    query = query.eq("is_flagged", true);
  }

  const { data, count, error } = await query;
  if (error) {
    console.error("[responses GET]", error.message);
    return NextResponse.json({ error: "Failed to load responses." }, { status: 500 });
  }

  return NextResponse.json({
    data: (data || []).map(mapUserRowForDashboard),
    total: count,
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

  const safe = {};
  const allowed = ["full_name", "name", "email", "phone", "frequency", "is_flagged", "notes"];
  for (const key of allowed) {
    if (updates[key] === undefined) continue;
    if (key === "is_flagged") {
      if (typeof updates[key] !== "boolean") {
        return NextResponse.json({ error: "is_flagged must be a boolean" }, { status: 422 });
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

  safe.updated_at = new Date().toISOString();

  const db = getDataClient();

  const { data: oldRow } = await db
    .from(FUNNEL_USERS_TABLE)
    .select("*")
    .eq("user_id", id)
    .single();

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

  return NextResponse.json({ data: mapUserRowForDashboard(data) });
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
