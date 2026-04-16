import {
  persistPhone,
  persistEmail,
  resolvePhoneFromDb,
  resolveEmailFromDb,
} from '@/lib/survey/contact-storage';

/** PostgREST table for funnel signups (not `auth.users`). */
export const FUNNEL_USERS_TABLE = 'users';

/** Columns for dashboard list/grid only (not full user row). */
export const FUNNEL_USER_LIST_SELECT =
  'user_id,full_name,phone_encrypted,email_encrypted,verified_at,heard_from,favorite_game_id,favorite_game,is_flagged,bonus_granted,contacted,has_replied,notes';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isFunnelUserId(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

export function persistUserPhone(e164) {
  const p = persistPhone(e164);
  return { phone_encrypted: p.phone, phone_hash: p.phone_hash };
}

export function persistUserEmail(emailPlainOrNull) {
  const p = persistEmail(emailPlainOrNull);
  return { email_encrypted: p.email, email_hash: p.email_hash };
}

/**
 * Map DB row → dashboard / legacy UI shape (decrypt contact fields server-side).
 * @param {Record<string, unknown>} row
 * @param {Record<string, string>} [favoriteGameNames] — map `favorite_game_id` → display name (legacy rows)
 */
export function mapUserRowForDashboard(row, favoriteGameNames = {}) {
  if (!row) return row;
  const gid = row.favorite_game_id;
  const fromId = gid && typeof gid === "string" ? favoriteGameNames[gid] ?? null : null;
  const fromText =
    typeof row.favorite_game === "string" && row.favorite_game.trim() ? row.favorite_game.trim() : null;
  return {
    ...row,
    id: row.user_id,
    name: row.full_name,
    phone: resolvePhoneFromDb(row.phone_encrypted) ?? row.phone_encrypted,
    email: resolveEmailFromDb(row.email_encrypted) ?? row.email_encrypted,
    verified: row.verified_at != null,
    submitted_at: row.created_at,
    favorite_game_name: fromText || fromId || null,
  };
}

/**
 * Minimal shape for leads/customers table + edit modal (no full DB row spread).
 */
export function mapUserRowForList(row, favoriteGameNames = {}) {
  if (!row) return row;
  const gid = row.favorite_game_id;
  const fromId = gid && typeof gid === "string" ? favoriteGameNames[gid] ?? null : null;
  const fromText =
    typeof row.favorite_game === "string" && row.favorite_game.trim() ? row.favorite_game.trim() : null;
  const heard =
    typeof row.heard_from === "string" && row.heard_from.trim() ? row.heard_from.trim() : null;
  return {
    id: row.user_id,
    name: row.full_name,
    phone: resolvePhoneFromDb(row.phone_encrypted) ?? row.phone_encrypted,
    email: resolveEmailFromDb(row.email_encrypted) ?? row.email_encrypted,
    verified: row.verified_at != null,
    heardFrom: heard,
    favorite_game_name: fromText || fromId || null,
    is_flagged: !!row.is_flagged,
    bonus_granted: !!row.bonus_granted,
    contacted: !!row.contacted,
    has_replied: !!row.has_replied,
    notes: row.notes ?? null,
  };
}
