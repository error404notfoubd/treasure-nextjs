"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/toast";
import { useUser } from "../dashboard-client";
import { apiFetch } from "@/lib/dashboard/api-client";
import { canViewUserIdentifiers } from "@/lib/roles";
import { IconRefresh, IconEye, IconX } from "@/components/icons";
import { SkeletonAuditEntry } from "@/components/skeleton";

const OP_COLORS = {
  INSERT: "bg-success",
  UPDATE: "bg-accent",
  DELETE: "bg-danger",
  APPROVE: "bg-success",
  REJECT: "bg-danger",
  ROLE_CHANGE: "bg-warn",
  PASSWORD_RESET: "bg-warn",
  DELETE_USER: "bg-danger",
};

const OP_LABELS = {
  INSERT: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
  APPROVE: "Approved",
  PASSWORD_RESET: "Password reset",
  REJECT: "Rejected",
  ROLE_CHANGE: "Role changed",
  DELETE_USER: "Removed user",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hide profile / funnel UUID fields in audit diff for non–owner/admin viewers. */
function shouldHideAuditField(key, sampleVal, showUserIds) {
  if (showUserIds) return false;
  const k = String(key);
  if (k === "user_id") return true;
  if (k === "id" && (typeof sampleVal !== "string" || UUID_RE.test(sampleVal))) return true;
  return false;
}

/** Do not list email-related columns in audit detail (values are sensitive). */
function shouldHideAuditEmailField(key) {
  const k = String(key).toLowerCase();
  if (k === "email" || k === "email_encrypted" || k === "email_hash") return true;
  return false;
}

export default function AuditPage() {
  const toast = useToast();
  const actor = useUser();
  const showUserIds = canViewUserIdentifiers(actor?.role);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [auditSummary, setAuditSummary] = useState(null);
  const [auditDetailLog, setAuditDetailLog] = useState(null);
  const [auditDetailLoading, setAuditDetailLoading] = useState(false);
  const [auditDetailError, setAuditDetailError] = useState(null);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/audit?limit=100");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setLogs(json.data || []);
    } catch (err) {
      toast("Failed to load audit log: " + err.message, "error");
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const openAuditDetail = async (summaryRow) => {
    setAuditSummary(summaryRow);
    setAuditDetailLog(null);
    setAuditDetailError(null);
    setAuditDetailLoading(true);
    try {
      const res = await apiFetch(`/api/audit/${summaryRow.id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setAuditDetailLog(json.data);
    } catch (err) {
      setAuditDetailError(err.message);
    }
    setAuditDetailLoading(false);
  };

  const closeAuditDetail = () => {
    setAuditSummary(null);
    setAuditDetailLog(null);
    setAuditDetailError(null);
    setAuditDetailLoading(false);
  };

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-surface-3/50 bg-surface-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4 lg:px-7">
        <h2 className="text-base font-bold tracking-tight sm:text-lg">Audit Log</h2>
        <button
          className="btn btn-ghost btn-sm gap-1.5"
          onClick={fetchAudit}
          disabled={loading}
          title="Refresh audit log"
        >
          <IconRefresh size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">
        <div className="card overflow-hidden">
          <div className="flex flex-col gap-1 border-b border-surface-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3.5">
            <h3 className="text-sm font-semibold">Activity Trail</h3>
            <span className="text-xs text-ink-4">Last 100 entries</span>
          </div>

          <div className="px-4 py-3 sm:px-5">
            {loading ? (
              <div className="space-y-0">
                {Array.from({ length: 10 }).map((_, i) => (
                  <SkeletonAuditEntry key={i} />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-16 text-ink-4">
                <div className="text-3xl mb-3 opacity-30">📋</div>
                No audit entries yet
              </div>
            ) : (
              <div className="space-y-0">
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-3 items-start py-3 border-b border-surface-3/40 last:border-b-0">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${OP_COLORS[log.operation] || "bg-ink-4"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-ink-2">
                        <strong className="text-ink-1">{OP_LABELS[log.operation] || log.operation}</strong>
                        {" on "}
                        <strong className="text-ink-1">{log.table_name}</strong>
                        <EntryDetail log={log} showUserIds={showUserIds} />
                      </div>
                      <div className="text-[11px] text-ink-4 font-mono mt-0.5 flex items-center gap-2">
                        <span>{new Date(log.performed_at).toLocaleString()}</span>
                        {log.performed_by && log.performed_by !== "system" && log.performed_by !== "service_role" && (
                          <span className="inline-flex items-center gap-1 text-ink-3">
                            by <span className="text-ink-2 font-semibold">{log.performed_by}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="flex-shrink-0 mt-0.5 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-ink-3 hover:text-accent hover:bg-accent-muted transition-colors"
                      onClick={() => openAuditDetail(log)}
                      title="View data changes"
                    >
                      <IconEye size={12} />
                      <span className="hidden sm:inline">Details</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {auditSummary && (
        <DataDiffModal
          log={auditDetailLog}
          summary={auditSummary}
          loading={auditDetailLoading}
          errorMessage={auditDetailError}
          showUserIds={showUserIds}
          onClose={closeAuditDetail}
        />
      )}
    </>
  );
}

function EntryDetail({ log, showUserIds }) {
  if (log.operation === "UPDATE" && log.change_summary) {
    return <span className="text-ink-3"> — {log.change_summary}</span>;
  }

  const name =
    log.new_data?.name ||
    log.old_data?.name ||
    log.new_data?.full_name ||
    log.old_data?.full_name ||
    log.new_data?.lead_snapshot?.full_name ||
    log.new_data?.lead_snapshot?.name;

  if (log.operation === "ROLE_CHANGE") {
    return (
      <span className="text-ink-3">
        {name && <> — {name}</>}
        {log.old_data?.role && log.new_data?.role && (
          <> ({log.old_data.role} → {log.new_data.role})</>
        )}
      </span>
    );
  }

  if (log.operation === "APPROVE" || log.operation === "REJECT") {
    return name ? <span className="text-ink-3"> — {name}</span> : null;
  }

  if (log.operation === "DELETE_USER") {
    return name ? <span className="text-ink-3"> — {name}</span> : null;
  }

  if (name) {
    return <span className="text-ink-3"> — {name}</span>;
  }

  if (showUserIds && log.row_id) {
    return <span className="text-ink-3"> (#{log.row_id})</span>;
  }

  return null;
}

// ── Data diff modal ──────────────────────────────────────

function formatValue(val) {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "object") return JSON.stringify(val, null, 2);
  return String(val);
}

function formatFieldName(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function DataDiffModal({ log, summary, loading, errorMessage, showUserIds, onClose }) {
  useEffect(() => {
    const handleEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const meta = log || summary;
  const oldData = log?.old_data && typeof log.old_data === "object" ? log.old_data : {};
  const newData = log?.new_data && typeof log.new_data === "object" ? log.new_data : {};
  const allKeysRaw = [...new Set([...Object.keys(oldData), ...Object.keys(newData)])];
  const allKeys = allKeysRaw.filter(
    (key) =>
      !shouldHideAuditEmailField(key) &&
      !shouldHideAuditField(key, oldData[key] ?? newData[key], showUserIds)
  );

  const hasOld = Object.keys(oldData).length > 0;
  const hasNew = Object.keys(newData).length > 0;
  const hasBoth = hasOld && hasNew;

  const opLabel = OP_LABELS[meta.operation] || meta.operation;
  const opColor = OP_COLORS[meta.operation] || "bg-ink-4";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface-2 border border-surface-4 rounded-xl w-full max-w-[640px] mx-4 shadow-2xl animate-slide-up max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${opColor}`} />
            <div>
              <h3 className="text-[15px] font-bold">{opLabel} — {meta.table_name}</h3>
              <p className="text-[11px] text-ink-4 font-mono mt-0.5">
                {new Date(meta.performed_at).toLocaleString()}
                {meta.performed_by &&
                  meta.performed_by !== "system" &&
                  meta.performed_by !== "service_role" && (
                  <> &middot; {meta.performed_by}</>
                )}
                {showUserIds && meta.row_id && <> &middot; ID: {meta.row_id}</>}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-ink-3 hover:text-ink-1 hover:bg-surface-3 transition-colors"
          >
            <IconX />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {errorMessage ? (
            <p className="text-sm text-danger">{errorMessage}</p>
          ) : loading || !log ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-4">
              <div className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin" aria-hidden />
              <p className="text-sm">Loading details…</p>
            </div>
          ) : hasBoth ? (
            <div className="space-y-0">
              <div className="grid grid-cols-[1fr_1fr] gap-0 mb-3">
                <div className="text-[11px] font-semibold text-danger uppercase tracking-wider px-3 py-1.5">Before</div>
                <div className="text-[11px] font-semibold text-success uppercase tracking-wider px-3 py-1.5">After</div>
              </div>
              {allKeys.map((key) => {
                const oldVal = formatValue(oldData[key]);
                const newVal = formatValue(newData[key]);
                const changed = oldVal !== newVal;
                return (
                  <div key={key} className={`grid grid-cols-[1fr_1fr] gap-0 border-b border-surface-3/40 last:border-b-0 ${changed ? "bg-surface-3/20" : ""}`}>
                    <div className="px-3 py-2.5 border-r border-surface-3/40">
                      <div className="text-[10px] font-semibold text-ink-4 uppercase tracking-wider mb-0.5">{formatFieldName(key)}</div>
                      <div className={`text-xs font-mono break-all ${changed ? "text-danger" : "text-ink-3"}`}>
                        {oldVal}
                      </div>
                    </div>
                    <div className="px-3 py-2.5">
                      <div className="text-[10px] font-semibold text-ink-4 uppercase tracking-wider mb-0.5">{formatFieldName(key)}</div>
                      <div className={`text-xs font-mono break-all ${changed ? "text-success" : "text-ink-3"}`}>
                        {newVal}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : hasOld || hasNew ? (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-3 px-1 text-ink-3">
                {hasOld ? "Deleted Data" : "Created Data"}
              </div>
              <div className="space-y-0">
                {Object.entries(hasOld ? oldData : newData)
                  .filter(
                    ([key, val]) =>
                      !shouldHideAuditEmailField(key) && !shouldHideAuditField(key, val, showUserIds)
                  )
                  .map(([key, val]) => (
                  <div key={key} className="flex items-baseline gap-3 py-2 border-b border-surface-3/40 last:border-b-0 px-1">
                    <span className="text-[10px] font-semibold text-ink-4 uppercase tracking-wider w-28 flex-shrink-0">{formatFieldName(key)}</span>
                    <span className={`text-xs font-mono break-all ${hasOld ? "text-danger" : "text-success"}`}>
                      {formatValue(val)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-4">No before/after payload stored for this entry.</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3 border-t border-surface-3 flex-shrink-0">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
