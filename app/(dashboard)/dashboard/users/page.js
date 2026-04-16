"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useUser } from "../dashboard-client";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/dashboard/api-client";
import {
  ROLES,
  ROLE_ORDER,
  PERMISSIONS,
  canAssignRole,
  canChangeUserRole,
  canModifyUser,
  canRemoveUser,
  canToggleVerifiedLeadNotifications,
  getRoleLevel,
} from "@/lib/roles";
import { PERMISSION_CATALOG, ROLE_CARD_ORDER } from "@/lib/permissions-catalog";
import { IconEdit, IconTrash, IconRefresh, IconCheck, IconX, IconKey, IconActivity, IconBell } from "@/components/icons";
import { SkeletonRoleCard, SkeletonTableRows } from "@/components/skeleton";
import Modal from "@/components/modal";
import { validatePasswordStrength } from "@/lib/auth/password";

function permissionLabelsForRole(roleKey, grants) {
  if (!grants) return PERMISSIONS[roleKey] || [];
  return PERMISSION_CATALOG.filter(({ key }) => (grants[key] || []).includes(roleKey)).map((p) => p.label);
}

export default function UsersPage() {
  const user = useUser();
  const toast = useToast();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resetPwTarget, setResetPwTarget] = useState(null);
  const [activityTarget, setActivityTarget] = useState(null);
  /** { profile, next: boolean } — next is desired receive_verified_lead_notifications value */
  const [notifyPrefModal, setNotifyPrefModal] = useState(null);
  /** Effective grants from DB for role summary cards (admins can read). */
  const [roleGrants, setRoleGrants] = useState(null);
  /** Same minimum as server + used with {@link validatePasswordStrength} in reset modal. */
  const [passwordMinLength, setPasswordMinLength] = useState(8);

  const isOwner = user?.role === "owner";

  /**
   * Role summary cards: only for owner & admin. Viewers and editors never see this strip.
   * For admin/owner, only cards at or below their rank (admin does not see the Owner card).
   */
  const visibleRoleCardKeys = useMemo(() => {
    const actor = user?.role;
    if (actor !== "owner" && actor !== "admin") return [];
    if (!actor || !ROLES[actor]) return [];
    const cap = getRoleLevel(actor);
    return ROLE_CARD_ORDER.filter((key) => getRoleLevel(key) <= cap);
  }, [user?.role]);

  const roleCardGridClass =
    visibleRoleCardKeys.length >= 4
      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
      : visibleRoleCardKeys.length === 3
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        : visibleRoleCardKeys.length === 2
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-1";

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/users");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setProfiles(json.data || []);
    } catch (err) {
      toast("Failed to load users: " + err.message, "error");
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (user?.role !== "owner" && user?.role !== "admin") return;
    (async () => {
      try {
        const res = await apiFetch("/api/dashboard/permission-grants");
        const json = await res.json();
        if (!res.ok) return;
        if (json.grants) setRoleGrants(json.grants);
      } catch {
        // ignore
      }
    })();
  }, [user?.role]);

  useEffect(() => {
    if (!isOwner) return;
    (async () => {
      try {
        const res = await apiFetch("/api/dashboard/app-settings");
        const json = await res.json();
        if (!res.ok) return;
        if (typeof json.passwordMinLength === "number" && json.passwordMinLength > 0) {
          setPasswordMinLength(json.passwordMinLength);
        }
      } catch {
        // ignore
      }
    })();
  }, [isOwner]);

  const handleRoleChange = async (userId, newRole) => {
    try {
      const res = await apiFetch("/api/users", {
        method: "PATCH",
        body: JSON.stringify({ userId, role: newRole }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast("Role updated", "success");
      setEditTarget(null);
      fetchUsers();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleApproval = async (userId, action) => {
    try {
      const res = await apiFetch("/api/users/requests", {
        method: "PATCH",
        body: JSON.stringify({ userId, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(action === "approve" ? "User approved" : "Request rejected", "success");
      fetchUsers();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await apiFetch("/api/users", {
        method: "DELETE",
        body: JSON.stringify({ userId: deleteTarget.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast("User removed", "success");
      setDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleNotifyPrefConfirm = async () => {
    if (!notifyPrefModal) return;
    const { profile, next } = notifyPrefModal;
    try {
      const res = await apiFetch("/api/users/notification-preference", {
        method: "PATCH",
        body: JSON.stringify({
          userId: profile.id,
          receiveVerifiedLeadNotifications: next,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(next ? "Verified lead emails enabled" : "Verified lead emails disabled", "success");
      setNotifyPrefModal(null);
      fetchUsers();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-surface-3/50 bg-surface-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4 lg:px-7">
        <div>
          <h2 className="text-base font-bold tracking-tight sm:text-lg">User Management</h2>
          {isOwner && (
            <p className="text-[11px] text-ink-4 mt-1">
              Edit who can do what in the console:{" "}
              <Link href="/dashboard/permissions" className="text-accent hover:underline font-medium">
                Dashboard permissions
              </Link>
            </p>
          )}
        </div>
        <button
          className="btn btn-ghost btn-sm gap-1.5"
          onClick={fetchUsers}
          disabled={loading}
          title="Refresh users"
        >
          <IconRefresh size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6 lg:p-7">
        {/* Role cards: owner & admin only; checkmarks from permission matrix; ranks at or below the signed-in user */}
        {visibleRoleCardKeys.length > 0 && (
          <div className={`grid gap-3 ${roleCardGridClass}`}>
            {loading ? (
              Array.from({ length: Math.max(visibleRoleCardKeys.length, 1) }).map((_, i) => (
                <SkeletonRoleCard key={i} />
              ))
            ) : (
              visibleRoleCardKeys.map((key) => {
                const role = ROLES[key];
                const count = profiles.filter((p) => p.role === key).length;
                return (
                  <div key={key} className="card p-5">
                    <div className="text-2xl mb-2">{role.icon}</div>
                    <div className="text-sm font-bold" style={{ color: role.color }}>
                      {role.label}
                    </div>
                    <div className="text-[11px] text-ink-4 mt-1 leading-relaxed">
                      {role.description}
                    </div>
                    <div className="text-[11px] text-ink-4 font-mono mt-3">
                      {count} user{count !== 1 ? "s" : ""}
                    </div>
                    <div className="mt-3 space-y-1">
                      {permissionLabelsForRole(key, roleGrants).map((p) => (
                        <div key={p} className="flex items-center gap-1.5 text-[11px] text-ink-3">
                          <span className="text-success">✓</span> {p}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Users Table */}
        <div className="card overflow-hidden">
          <div className="flex flex-col gap-1 border-b border-surface-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3.5">
            <h3 className="text-sm font-semibold">Dashboard Users</h3>
            <span className="text-xs text-ink-4">{profiles.length} users</span>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonTableRows rows={5} cols={5} />
                ) : profiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-ink-4">
                      No users found
                    </td>
                  </tr>
                ) : (
                  profiles.map((p) => {
                    const role = ROLES[p.role] || ROLES.viewer;
                    const isSelf = p.id === user?.id;
                    const canModify = canModifyUser(user?.role, p.role);
                    const canEditRole =
                      canModify &&
                      canChangeUserRole(user?.role, user?.id, p.id, p.role);
                    const canRemoveRow = canRemoveUser(user?.role, user?.id, p.id, p.role);
                    const canNotifyToggle = canToggleVerifiedLeadNotifications(user?.role, p.role);
                    const notifyOn = p.receive_verified_lead_notifications === true;
                    return (
                      <tr key={p.id}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                              style={{ background: role.color }}
                            >
                              {(p.full_name || p.email || "?")[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-ink-1">
                                {p.full_name || "—"}
                                {isSelf && <span className="text-[10px] text-ink-4 ml-1.5">(you)</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="text-ink-2">{p.email}</td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <span
                              className="badge"
                              style={{ background: role.bgColor, color: role.color }}
                            >
                              {role.icon} {role.label}
                            </span>
                            {p.status === "pending" && (
                              <span className="badge bg-warn-muted text-warn">⏳ Pending</span>
                            )}
                            {p.status === "rejected" && (
                              <span className="badge bg-danger-muted text-danger">✕ Rejected</span>
                            )}
                          </div>
                        </td>
                        <td className="font-mono text-[11px] text-ink-4">
                          {new Date(p.created_at).toLocaleDateString()}
                        </td>
                        <td>
                          <div className="flex gap-1">
                            {canNotifyToggle && (
                              <button
                                type="button"
                                className={`p-1.5 rounded-md transition-colors ${
                                  notifyOn
                                    ? "text-accent hover:bg-accent-muted"
                                    : "text-ink-4 hover:text-ink-2 hover:bg-surface-3"
                                }`}
                                title={
                                  notifyOn
                                    ? "Verified lead emails on — click to change"
                                    : "Verified lead emails off — click to turn on"
                                }
                                aria-label={
                                  notifyOn ? "Verified lead emails on, open change dialog" : "Turn on verified lead emails"
                                }
                                onClick={() =>
                                  setNotifyPrefModal({ profile: p, next: !notifyOn })
                                }
                              >
                                <IconBell off={!notifyOn} size={14} />
                              </button>
                            )}
                            {p.status === "pending" && (
                              <>
                                <button
                                  className="p-1.5 rounded-md text-success hover:bg-success-muted transition-colors"
                                  title="Approve"
                                  onClick={() => handleApproval(p.id, "approve")}
                                >
                                  <IconCheck />
                                </button>
                                <button
                                  className="p-1.5 rounded-md text-danger hover:bg-danger-muted transition-colors"
                                  title="Reject"
                                  onClick={() => handleApproval(p.id, "reject")}
                                >
                                  <IconX size={14} />
                                </button>
                              </>
                            )}
                            {p.status === "rejected" && (
                              <button
                                className="p-1.5 rounded-md text-success hover:bg-success-muted transition-colors"
                                title="Approve"
                                onClick={() => handleApproval(p.id, "approve")}
                              >
                                <IconCheck />
                              </button>
                            )}
                            {p.status === "approved" && (
                              <button
                                className="p-1.5 rounded-md text-ink-4 hover:text-accent hover:bg-accent-muted transition-colors"
                                title="View activity"
                                onClick={() => setActivityTarget(p)}
                              >
                                <IconActivity size={14} />
                              </button>
                            )}
                            {!isSelf && canModify && p.status === "approved" && (
                              <>
                                {canEditRole && (
                                <button
                                  className="p-1.5 rounded-md text-ink-4 hover:text-ink-1 hover:bg-surface-3 transition-colors"
                                  title="Change role"
                                  onClick={() => setEditTarget(p)}
                                >
                                  <IconEdit />
                                </button>
                                )}
                                {isOwner && p.role !== "owner" && (
                                  <button
                                    className="p-1.5 rounded-md text-ink-4 hover:text-accent hover:bg-accent-muted transition-colors"
                                    title="Reset password"
                                    onClick={() => setResetPwTarget(p)}
                                  >
                                    <IconKey />
                                  </button>
                                )}
                                {canRemoveRow && (
                                <button
                                  className="p-1.5 rounded-md text-ink-4 hover:text-danger hover:bg-danger-muted transition-colors"
                                  title="Remove user"
                                  onClick={() => setDeleteTarget(p)}
                                >
                                  <IconTrash />
                                </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Role Modal */}
      {editTarget && (
        <EditRoleModal
          target={editTarget}
          actorRole={user?.role}
          onClose={() => setEditTarget(null)}
          onSave={(newRole) => handleRoleChange(editTarget.id, newRole)}
        />
      )}

      {/* User Activity */}
      {activityTarget && (
        <ActivityModal
          target={activityTarget}
          onClose={() => setActivityTarget(null)}
        />
      )}

      {/* Reset Password */}
      {resetPwTarget && (
        <ResetPasswordModal
          target={resetPwTarget}
          passwordMinLength={passwordMinLength}
          onClose={() => setResetPwTarget(null)}
          onSuccess={() => { setResetPwTarget(null); toast("Password reset successfully", "success"); }}
        />
      )}

      {notifyPrefModal && (
        <Modal
          title="Verified lead emails"
          onClose={() => setNotifyPrefModal(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setNotifyPrefModal(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleNotifyPrefConfirm}>
                Confirm
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-2 leading-relaxed">
            {notifyPrefModal.next ? (
              <>
                Turn <strong className="text-ink-1">on</strong> email when a survey lead completes phone verification for{" "}
                <strong className="text-ink-1">{notifyPrefModal.profile.full_name || notifyPrefModal.profile.email}</strong>?
              </>
            ) : (
              <>
                Turn <strong className="text-ink-1">off</strong> those notifications for{" "}
                <strong className="text-ink-1">{notifyPrefModal.profile.full_name || notifyPrefModal.profile.email}</strong>?
              </>
            )}
          </p>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <Modal
          title="Remove User"
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Remove User</button>
            </>
          }
        >
          <p className="text-sm text-ink-2 leading-relaxed">
            Remove <strong className="text-ink-1">{deleteTarget.full_name || deleteTarget.email}</strong>?
            This deletes their account and cannot be undone.
          </p>
        </Modal>
      )}
    </>
  );
}

const OP_COLORS = {
  INSERT: "bg-success", UPDATE: "bg-accent", DELETE: "bg-danger",
  APPROVE: "bg-success", REJECT: "bg-danger", ROLE_CHANGE: "bg-warn",
  PASSWORD_RESET: "bg-warn", DELETE_USER: "bg-danger",
};
const OP_LABELS = {
  INSERT: "Created", UPDATE: "Updated", DELETE: "Deleted",
  APPROVE: "Approved", REJECT: "Rejected", ROLE_CHANGE: "Role changed",
  PASSWORD_RESET: "Password reset", DELETE_USER: "Removed user",
};

function ActivityModal({ target, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams({ limit: "50", userId: target.id });
        if (target.full_name) params.set("userName", target.full_name);
        const res = await apiFetch(`/api/audit?${params}`);
        const json = await res.json();
        setLogs(json.data || []);
      } catch {
        // ignore
      }
      setLoading(false);
    })();
  }, [target.id, target.full_name]);

  return (
    <Modal
      title={`Activity — ${target.full_name || target.email}`}
      onClose={onClose}
      footer={
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      }
    >
      <div className="max-h-[400px] overflow-y-auto -mx-1 px-1">
        {loading ? (
          <div className="text-center py-10 text-ink-4 text-sm">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-10 text-ink-4 text-sm">No activity recorded</div>
        ) : (
          <div className="space-y-0">
            {logs.map((log) => (
                <div key={log.id} className="flex gap-2.5 items-start py-2.5 border-b border-surface-3/40 last:border-b-0">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${OP_COLORS[log.operation] || "bg-ink-4"}`} />
                  <div className="min-w-0">
                    <div className="text-xs text-ink-2">
                      <strong className="text-ink-1">{OP_LABELS[log.operation] || log.operation}</strong>
                      {" on "}
                      <span className="text-ink-1">{log.table_name}</span>
                      {log.change_summary ? <span className="text-ink-3"> — {log.change_summary}</span> : null}
                    </div>
                    <div className="text-[10px] text-ink-4 font-mono mt-0.5">
                      {new Date(log.performed_at).toLocaleString()}
                      {log.performed_by && log.performed_by !== "system" && log.performed_by !== "service_role" && (
                        <span className="ml-1.5">by {log.performed_by}</span>
                      )}
                    </div>
                  </div>
                </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ target, passwordMinLength, onClose, onSuccess }) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [show, setShow] = useState(false);

  const strengthErrors = validatePasswordStrength(password, passwordMinLength);
  const isValid = strengthErrors.length === 0 && password.length > 0 && password === confirm;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/auth/reset-user-password", {
        method: "POST",
        body: JSON.stringify({ userId: target.id, newPassword: password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      onSuccess();
    } catch (err) {
      toast(err.message || "Reset failed", "error");
    }
    setSaving(false);
  };

  return (
    <Modal
      title={`Reset Password — ${target.full_name || target.email}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!isValid || saving}
          >
            {saving ? "Resetting…" : "Reset Password"}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-ink-3 leading-relaxed">
          Set a new password for <strong className="text-ink-1">{target.full_name || target.email}</strong>.
          They will need to use this password on their next login. Passwords must meet the same rules as signup
          (length, upper and lower case, number, and special character).
        </p>
        <div>
          <label className="label">New Password</label>
          <input
            type={show ? "text" : "password"}
            className="input"
            placeholder={`At least ${passwordMinLength} characters + complexity`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={passwordMinLength}
            required
          />
          {password.length > 0 &&
            strengthErrors.map((msg) => (
              <p key={msg} className="text-[11px] text-warn mt-1">
                {msg}
              </p>
            ))}
        </div>
        <div>
          <label className="label">Confirm Password</label>
          <input
            type={show ? "text" : "password"}
            className="input"
            placeholder="Re-enter password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
          {confirm.length > 0 && password !== confirm && (
            <p className="text-[11px] text-danger mt-1">Passwords do not match</p>
          )}
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={show}
            onChange={(e) => setShow(e.target.checked)}
            className="accent-accent w-3.5 h-3.5"
          />
          <span className="text-[11px] text-ink-4">Show passwords</span>
        </label>
      </form>
    </Modal>
  );
}

function EditRoleModal({ target, actorRole, onClose, onSave }) {
  const [role, setRole] = useState(target.role);

  const assignableRoles = ROLE_ORDER.filter((r) => canAssignRole(actorRole, r));

  return (
    <Modal
      title={`Change Role — ${target.full_name || target.email}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(role)} disabled={role === target.role}>
            Update Role
          </button>
        </>
      }
    >
      <div>
        <label className="label">New Role</label>
        <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
          {assignableRoles.map((r) => (
            <option key={r} value={r}>
              {ROLES[r].icon} {ROLES[r].label}
            </option>
          ))}
          {/* Show current role even if not assignable (for display) */}
          {!assignableRoles.includes(target.role) && (
            <option value={target.role} disabled>
              {ROLES[target.role]?.icon} {ROLES[target.role]?.label} (current)
            </option>
          )}
        </select>
        <p className="text-[11px] text-ink-4 mt-2">
          {ROLES[role]?.description}
        </p>
      </div>
    </Modal>
  );
}
