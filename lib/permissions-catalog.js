/** Stable keys stored in DB and sent to APIs (order = UI order). */
export const PERMISSION_CATALOG = [
  { key: "view_leads", label: "View all survey responses (leads)" },
  { key: "edit_leads", label: "Edit any record" },
  { key: "verify_leads", label: "Verify / unverify leads (SMS verified state)" },
  { key: "delete_leads", label: "Delete records" },
  { key: "approve_signups", label: "Approve / reject sign-up requests" },
  { key: "manage_dashboard_users", label: "Manage dashboard users & roles" },
  { key: "view_audit", label: "View audit log" },
  { key: "modify_system_settings", label: "Modify system settings (game & auth tunables)" },
];

export const PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);

/** Column order in the permission matrix (viewer → owner). */
export const DASHBOARD_ROLES = ["viewer", "editor", "admin", "owner"];

/** Role summary cards on User Management (owner first). */
export const ROLE_CARD_ORDER = ["owner", "admin", "editor", "viewer"];
