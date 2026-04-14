// ── Role Definitions ──────────────────────────────────────
export const ROLES = {
  owner: {
    level: 100,
    label: "Owner",
    color: "#F5B731",
    bgColor: "rgba(245,183,49,0.12)",
    icon: "♔",
    description: "Full system access — manage everything",
  },
  admin: {
    level: 80,
    label: "Admin",
    color: "#4A9EF5",
    bgColor: "rgba(74,158,245,0.12)",
    icon: "⚙",
    description: "Manage data, users, and view audit logs",
  },
  editor: {
    level: 50,
    label: "Editor",
    color: "#32D583",
    bgColor: "rgba(50,213,131,0.12)",
    icon: "✎",
    description: "View and edit survey data",
  },
  viewer: {
    level: 10,
    label: "Viewer",
    color: "#9EAAB8",
    bgColor: "rgba(158,170,184,0.12)",
    icon: "◉",
    description: "Read-only access to data",
  },
};

/** Fixed ladder for “who may edit whom” in user management (not configurable in DB). */
const ROLE_RANK = {
  viewer: 10,
  editor: 50,
  admin: 80,
  owner: 100,
};

export const ROLE_ORDER = ["admin", "editor", "viewer"];

// ── Permissions (static blurbs on role cards when grant matrix unavailable) ─
export const PERMISSIONS = {
  owner: [
    "View all survey responses",
    "Edit any record",
    "Delete any record",
    "Manage all users & roles",
    "Promote/demote any role",
    "View audit log",
    "Modify system settings",
    "Games list (survey favorite games)",
  ],
  admin: [
    "View all survey responses",
    "Edit any record",
    "Delete records",
    "Approve / reject sign-up requests",
    "Manage editors & viewers",
    "View audit log",
    "Games list (survey favorite games)",
  ],
  editor: [
    "View all survey responses",
    "Edit records",
    "Flag / unflag entries",
    "Games list (survey favorite games)",
  ],
  viewer: [
    "View survey responses (read-only)",
  ],
};

/** @param {string} role */
export function getRoleLevel(role) {
  const n = ROLE_RANK[role];
  return typeof n === "number" ? n : 0;
}

export function canAssignRole(assignerRole, targetRole) {
  if (targetRole === "owner") return false;
  return getRoleLevel(assignerRole) > getRoleLevel(targetRole);
}

export function canModifyUser(actorRole, targetRole) {
  if (targetRole === "owner") return actorRole === "owner";
  return getRoleLevel(actorRole) > getRoleLevel(targetRole);
}

/**
 * Whether the actor may PATCH another user's `role` (dashboard).
 * Owners may not change another owner's role (only Supabase / direct DB per product rules).
 */
export function canChangeUserRole(actorRole, actorUserId, targetUserId, targetRole) {
  if (!canModifyUser(actorRole, targetRole)) return false;
  if (targetRole === "owner" && targetUserId !== actorUserId) return false;
  return true;
}

/**
 * Whether the actor may DELETE another dashboard user (Auth + profile).
 * Owner accounts cannot be removed here (including by another owner); use Supabase / DB directly if needed.
 */
export function canRemoveUser(actorRole, actorUserId, targetUserId, targetRole) {
  if (!targetUserId || !actorUserId || targetUserId === actorUserId) return false;
  if (!canModifyUser(actorRole, targetRole)) return false;
  if (targetRole === "owner") return false;
  return true;
}

/** Dashboard UI: show raw user / row UUIDs only to owner & admin. */
export function canViewUserIdentifiers(role) {
  return role === "owner" || role === "admin";
}
