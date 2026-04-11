import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { getDataClient } from "@/lib/supabase";
import { logAction } from "@/lib/audit";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";

const MAX_LIMIT = 100;

// Allow only safe alphanumeric, space, @, +, and dot for search
function sanitizeSearch(raw) {
  return raw.replace(/[^a-zA-Z0-9@.+ -]/g, "").trim().slice(0, 200);
}

// GET /api/responses?page=0&limit=15&search=...&flagged=true
export async function GET(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const guard = await requireRole(10); // viewer+
  if (guard.error) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get("page") || "0") || 0);
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "15") || 15), MAX_LIMIT);
  const search = sanitizeSearch(searchParams.get("search") || "");
  const flaggedOnly = searchParams.get("flagged") === "true";

  const db = getDataClient();
  let query = db
    .from("survey_responses")
    .select("*", { count: "exact" })
    .order("submitted_at", { ascending: false })
    .range(page * limit, page * limit + limit - 1);

  if (search) {
    const pattern = `%${search}%`;
    query = query.or(
      ["name", "email", "phone"]
        .map((col) => `${col}.ilike.${pattern}`)
        .join(",")
    );
  }
  if (flaggedOnly) {
    query = query.eq("is_flagged", true);
  }

  const { data, count, error } = await query;
  if (error) {
    console.error("[responses GET]", error.message);
    return NextResponse.json({ error: "Failed to load responses." }, { status: 500 });
  }

  return NextResponse.json({ data, total: count });
}

const MAX_NOTE_LEN = 8000;
const MAX_FIELD_LEN = 500;

// PATCH /api/responses — { id, updates }
export async function PATCH(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const guard = await requireRole(50); // editor+
  if (guard.error) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { id, updates } = body;
  if (!id || !Number.isInteger(id)) return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
  if (!updates || typeof updates !== "object") return NextResponse.json({ error: "Missing updates" }, { status: 400 });

  // Only allow safe fields; server enforces types (client cannot coerce DB types)
  const allowed = ["name", "email", "phone", "frequency", "is_flagged", "notes"];
  const safe = {};
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
    safe[key] = raw;
  }

  // "verified" requires admin+ (level 80)
  if (updates.verified !== undefined) {
    const { getRoleLevel } = await import("@/lib/roles");
    if (getRoleLevel(guard.user.role) < 80) {
      return NextResponse.json({ error: "Only admins can change verification status" }, { status: 403 });
    }
    if (typeof updates.verified !== "boolean") {
      return NextResponse.json({ error: "verified must be a boolean" }, { status: 422 });
    }
    safe.verified = updates.verified;
  }

  const db = getDataClient();

  const { data: oldRow } = await db
    .from("survey_responses")
    .select("*")
    .eq("id", id)
    .single();

  const { data, error } = await db
    .from("survey_responses")
    .update(safe)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[responses PATCH]", error.message);
    return NextResponse.json({ error: "Failed to update response." }, { status: 500 });
  }

  await logAction({
    table: "survey_responses",
    operation: "UPDATE",
    rowId: id,
    oldData: oldRow,
    newData: data,
    actor: guard.user.fullName || guard.user.email,
    actorRole: guard.user.role,
  });

  return NextResponse.json({ data });
}

// DELETE /api/responses — { id }
export async function DELETE(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const guard = await requireRole(80); // admin+
  if (guard.error) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { id } = body;
  if (!id || !Number.isInteger(id)) return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });

  const db = getDataClient();

  const { data: oldRow } = await db
    .from("survey_responses")
    .select("*")
    .eq("id", id)
    .single();

  const { error } = await db.from("survey_responses").delete().eq("id", id);

  if (error) {
    console.error("[responses DELETE]", error.message);
    return NextResponse.json({ error: "Failed to delete response." }, { status: 500 });
  }

  await logAction({
    table: "survey_responses",
    operation: "DELETE",
    rowId: id,
    oldData: oldRow,
    newData: null,
    actor: guard.user.fullName || guard.user.email,
    actorRole: guard.user.role,
  });

  return NextResponse.json({ success: true });
}
