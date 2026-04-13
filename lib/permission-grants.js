import { getAuthAdminClient } from "@/lib/supabase";
import { PERMISSION_KEYS, DASHBOARD_ROLES } from "@/lib/permissions-catalog";

/** Default grants when table is empty or read fails (matches prior role ladder). */
export const DEFAULT_PERMISSION_GRANTS = {
  view_leads: ["viewer", "editor", "admin", "owner"],
  edit_leads: ["editor", "admin", "owner"],
  verify_leads: ["admin", "owner"],
  delete_leads: ["admin", "owner"],
  approve_signups: ["admin", "owner"],
  manage_dashboard_users: ["admin", "owner"],
  view_audit: ["admin", "owner"],
  modify_system_settings: ["owner"],
};

let cache = null;
let cacheExpires = 0;
const TTL_MS = 15_000;

export function invalidatePermissionGrantCache() {
  cache = null;
  cacheExpires = 0;
}

/**
 * @returns {Promise<Record<string, string[]>>} permission_key -> roles allowed
 */
export async function getPermissionGrants() {
  if (cache && Date.now() < cacheExpires) return cache;

  const admin = getAuthAdminClient();
  const { data, error } = await admin.from("role_permission_grants").select("permission_key, role");

  if (error) {
    console.error("[role_permission_grants]", error.message);
    cache = structuredClone(DEFAULT_PERMISSION_GRANTS);
    cacheExpires = Date.now() + TTL_MS;
    return cache;
  }

  const map = {};
  for (const k of PERMISSION_KEYS) {
    map[k] = [];
  }
  if (Array.isArray(data)) {
    for (const row of data) {
      const pk = row?.permission_key;
      const r = row?.role;
      if (pk && r && map[pk] && DASHBOARD_ROLES.includes(r)) {
        if (!map[pk].includes(r)) map[pk].push(r);
      }
    }
  }

  const empty = PERMISSION_KEYS.every((k) => (map[k] || []).length === 0);
  if (empty) {
    cache = structuredClone(DEFAULT_PERMISSION_GRANTS);
  } else {
    cache = map;
  }
  cacheExpires = Date.now() + TTL_MS;
  return cache;
}

/**
 * @param {string} role
 * @returns {Promise<string[]>}
 */
export async function getPermissionKeysForRole(role) {
  if (role === "owner") return [...PERMISSION_KEYS];
  const grants = await getPermissionGrants();
  return PERMISSION_KEYS.filter((k) => (grants[k] || []).includes(role));
}

/**
 * @param {Record<string, string[]>} grants
 * @param {string} role
 * @param {string} permissionKey
 */
export function hasPermission(grants, role, permissionKey) {
  if (role === "owner") return true;
  if (!PERMISSION_KEYS.includes(permissionKey)) return false;
  const list = grants[permissionKey];
  return Array.isArray(list) && list.includes(role);
}

/**
 * @param {unknown} body
 * @returns {Record<string, string[]> | null} normalized grants or null if invalid
 */
export function parsePermissionGrantsPatch(body) {
  const raw = body?.grants;
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const key of PERMISSION_KEYS) {
    const arr = raw[key];
    if (!Array.isArray(arr)) return null;
    const roles = [];
    for (const x of arr) {
      if (typeof x !== "string" || !DASHBOARD_ROLES.includes(x)) return null;
      if (!roles.includes(x)) roles.push(x);
    }
    out[key] = roles;
  }
  return out;
}

/**
 * Owner role grants are immutable: every permission always includes `owner` in the stored matrix.
 * Client-supplied `owner` entries are ignored so owners cannot narrow (or fake-widen) the owner column.
 */
export function applyImmutableOwnerRoleGrants(parsed) {
  const out = {};
  for (const key of PERMISSION_KEYS) {
    const withoutOwner = (parsed[key] || []).filter((r) => r !== "owner");
    const merged = [...withoutOwner, "owner"];
    merged.sort((a, b) => DASHBOARD_ROLES.indexOf(a) - DASHBOARD_ROLES.indexOf(b));
    out[key] = merged;
  }
  return out;
}
