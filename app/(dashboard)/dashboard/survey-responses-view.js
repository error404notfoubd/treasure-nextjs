"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "./dashboard-client";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/dashboard/api-client";
import { IconSearch, IconEdit, IconFlag, IconTrash, IconChevLeft, IconChevRight, IconRefresh, IconShieldCheck, IconEye } from "@/components/icons";
import { SkeletonStatCard, SkeletonTableRows } from "@/components/skeleton";
import Modal from "@/components/modal";

async function copyDashboardCell(value, toast, label) {
  if (value == null || value === "") {
    toast("Nothing to copy", "info");
    return;
  }
  const text = String(value).trim();
  if (!text) {
    toast("Nothing to copy", "info");
    return;
  }
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      throw new Error("no clipboard");
    }
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {
      toast("Could not copy", "error");
      return;
    }
  }
  toast(`${label} copied`, "success");
}

export default function SurveyResponsesView({ pool, pageTitle }) {
  const user = useUser();
  const toast = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, flagged: 0, today: 0, verified: 0 });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [editRow, setEditRow] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [verifyRow, setVerifyRow] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsRow, setDetailsRow] = useState(null);
  const [detailsError, setDetailsError] = useState(null);
  const [confirmLeadToggle, setConfirmLeadToggle] = useState(null);
  const [poolTransitionNote, setPoolTransitionNote] = useState(null);
  const poolTransitionTimerRef = useRef(null);
  const perPage = 15;

  const perm = new Set(user?.permissions || []);
  const canEdit = perm.has("edit_leads");
  const canDelete = perm.has("delete_leads");
  const canVerify = perm.has("verify_leads");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: perPage.toString(),
        pool,
      });
      if (search) params.set("search", search);

      const [resData, resStats] = await Promise.all([
        apiFetch(`/api/responses?${params}`).then((r) => r.json()),
        apiFetch("/api/responses/stats").then((r) => r.json()),
      ]);

      setData(resData.data || []);
      setTotal(resData.total || 0);
      setStats(resStats);
    } catch (err) {
      toast("Failed to load data", "error");
    }
    setLoading(false);
  }, [page, search, toast, pool]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    return () => {
      if (poolTransitionTimerRef.current) clearTimeout(poolTransitionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setPoolTransitionNote(null);
    if (poolTransitionTimerRef.current) {
      clearTimeout(poolTransitionTimerRef.current);
      poolTransitionTimerRef.current = null;
    }
  }, [pool]);

  const handleToggleFlag = async (row) => {
    try {
      const res = await apiFetch("/api/responses", {
        method: "PATCH",
        body: JSON.stringify({ id: row.id, updates: { is_flagged: !row.is_flagged } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(row.is_flagged ? "Unflagged" : "Flagged", "success");
      fetchData();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const openDetails = async (id) => {
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailsRow(null);
    setDetailsError(null);
    try {
      const res = await apiFetch(`/api/responses/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setDetailsRow(json.data);
    } catch (err) {
      setDetailsError(err.message);
    }
    setDetailsLoading(false);
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setDetailsRow(null);
    setDetailsError(null);
    setDetailsLoading(false);
  };

  const applyLeadFieldUpdate = async (row, field, next) => {
    const updates = { [field]: next };
    if (field === "contacted" && !next) {
      updates.has_replied = false;
      updates.bonus_granted = false;
    }
    if (field === "has_replied" && !next) {
      updates.bonus_granted = false;
    }
    const beforePool = membershipPool(row);
    const afterState =
      field === "contacted" || field === "has_replied" || field === "bonus_granted"
        ? rowAfterLeadFieldUpdate(row, field, next)
        : null;
    const afterPool = afterState ? membershipPoolFromRowState(afterState) : beforePool;

    const res = await apiFetch("/api/responses", {
      method: "PATCH",
      body: JSON.stringify({ id: row.id, updates }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);

    if (afterState && beforePool !== afterPool) {
      const crumb = afterPool === "customers" ? "Moved to Customers" : "Moved to Leads";
      const msg =
        afterPool === "customers"
          ? "Saved — this person is now listed under Customers."
          : "Saved — this person is now listed under Leads.";
      toast(msg, "success");
      if (poolTransitionTimerRef.current) clearTimeout(poolTransitionTimerRef.current);
      setPoolTransitionNote(crumb);
      poolTransitionTimerRef.current = setTimeout(() => {
        setPoolTransitionNote(null);
        poolTransitionTimerRef.current = null;
      }, 8000);
    } else {
      toast("Updated", "success");
    }

    await fetchData();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("dashboard:nav-counts-refresh"));
    }
  };

  const requestBonusToggle = (row) => {
    const next = !row.bonus_granted;
    if (next && (!row.contacted || !row.has_replied)) {
      toast(
        "A bonus can only be recorded after the lead is marked contacted and has replied. Mark “Contacted”, then “Has replied”, then you can turn on “Bonus”.",
        "info"
      );
      return;
    }
    setConfirmLeadToggle({ row, field: "bonus_granted", next });
  };

  const requestHasRepliedToggle = (row) => {
    const next = !row.has_replied;
    if (next && !row.contacted) {
      toast(
        "Has replied can only be set after the lead is marked contacted. Mark “Contacted” first.",
        "info"
      );
      return;
    }
    setConfirmLeadToggle({ row, field: "has_replied", next });
  };

  const requestContactedToggle = (row) => {
    setConfirmLeadToggle({ row, field: "contacted", next: !row.contacted });
  };

  const handleConfirmLeadToggle = async () => {
    if (!confirmLeadToggle) return;
    const { row, field, next } = confirmLeadToggle;
    try {
      await applyLeadFieldUpdate(row, field, next);
      setConfirmLeadToggle(null);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteRow) return;
    try {
      const res = await apiFetch("/api/responses", {
        method: "DELETE",
        body: JSON.stringify({ id: deleteRow.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast("Record deleted", "success");
      setDeleteRow(null);
      fetchData();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleEditSave = async (updates) => {
    try {
      const res = await apiFetch("/api/responses", {
        method: "PATCH",
        body: JSON.stringify({ id: editRow.id, updates }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast("Updated successfully", "success");
      setEditRow(null);
      fetchData();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleToggleVerify = async () => {
    if (!verifyRow) return;
    try {
      const res = await apiFetch("/api/responses", {
        method: "PATCH",
        body: JSON.stringify({ id: verifyRow.id, updates: { verified: !verifyRow.verified } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(verifyRow.verified ? "Verification removed" : "Marked as verified", "success");
      setVerifyRow(null);
      fetchData();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const totalPages = Math.ceil(total / perPage);
  const tableColCount = 11 + (canEdit || canDelete || canVerify ? 1 : 0);

  return (
    <>
      {/* Topbar */}
      <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-surface-3/50 bg-surface-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-4 lg:px-7">
        <div className="min-w-0 flex flex-col gap-1">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-1 text-[11px] font-medium text-ink-3 sm:text-xs">
            <span className="text-ink-4">Dashboard</span>
            <span className="text-ink-4/70" aria-hidden>
              /
            </span>
            <span className="text-ink-2">{pageTitle}</span>
            {poolTransitionNote ? (
              <>
                <span className="text-ink-4/70" aria-hidden>
                  /
                </span>
                <span className="text-accent">{poolTransitionNote}</span>
              </>
            ) : null}
          </nav>
          <h2 className="text-base font-bold tracking-tight sm:text-lg">{pageTitle}</h2>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <button
            className="btn btn-ghost btn-sm w-fit gap-1.5"
            onClick={fetchData}
            disabled={loading}
            title="Refresh data"
          >
            <IconRefresh size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-surface-4 bg-surface-2 px-3 py-2 transition-colors focus-within:border-accent sm:max-w-md sm:flex-initial">
            <IconSearch className="flex-shrink-0 text-ink-4" />
            <input
              type="text"
              placeholder="Search name, email, phone…"
              className="min-w-0 flex-1 border-none bg-transparent font-sans text-sm text-ink-1 outline-none placeholder:text-ink-4 sm:w-[220px] sm:flex-none"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">
        {/* Stats */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:mb-6 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {loading ? (
            <>
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
            </>
          ) : (
            <>
              <StatCard label="Total Responses" value={stats.total} />
              <StatCard label="Today" value={stats.today} sub="submissions" />
              <StatCard
                label="Flagged"
                value={stats.flagged}
                valueColor={stats.flagged > 0 ? "text-danger" : "text-success"}
              />
              <StatCard
                label="Verified"
                value={stats.verified}
                valueColor={
                  stats.total === 0
                    ? "text-ink-4"
                    : stats.verified === 0
                      ? "text-danger"
                      : "text-accent"
                }
                sub={stats.total > 0 ? `${Math.round((stats.verified / stats.total) * 100)}% of total` : undefined}
              />
            </>
          )}
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          <div className="flex flex-col gap-1 border-b border-surface-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3.5">
            <h3 className="text-sm font-semibold">
              {pool === "customers" ? "Customers" : "Survey responses"}
            </h3>
            <span className="text-xs text-ink-4">{total} total</span>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>From</th>
                  <th>Verified</th>
                  <th>Favorite game</th>
                  <th>Status</th>
                  <th>Contacted</th>
                  <th>Has replied</th>
                  <th>Bonus</th>
                  <th>Details</th>
                  {(canEdit || canDelete || canVerify) && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonTableRows rows={8} cols={tableColCount} />
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={tableColCount} className="text-center py-16 text-ink-4">
                      No records found
                    </td>
                  </tr>
                ) : (
                  data.map((row) => (
                    <tr key={row.id}>
                      <td className="font-semibold text-ink-1">
                        <button
                          type="button"
                          className="text-left hover:underline decoration-dotted underline-offset-2 cursor-pointer"
                          title="Copy name"
                          onClick={() => copyDashboardCell(row.name, toast, "Name")}
                        >
                          {row.name}
                        </button>
                      </td>
                      <td className="font-mono text-xs text-ink-2">
                        <button
                          type="button"
                          className="text-left hover:underline decoration-dotted underline-offset-2 cursor-pointer font-mono"
                          title="Copy phone"
                          onClick={() => copyDashboardCell(row.phone, toast, "Phone")}
                        >
                          {row.phone}
                        </button>
                      </td>
                      <td className="text-ink-2">
                        {row.email ? (
                          <button
                            type="button"
                            className="text-left hover:underline decoration-dotted underline-offset-2 cursor-pointer"
                            title="Copy email"
                            onClick={() => copyDashboardCell(row.email, toast, "Email")}
                          >
                            {row.email}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="text-ink-2 text-sm max-w-[160px]">
                        <span className="line-clamp-2" title={row.heardFrom || undefined}>
                          {row.heardFrom || "—"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${row.verified ? "bg-accent/10 text-accent" : "bg-danger-muted text-danger"}`}
                        >
                          {row.verified ? "✓ Verified" : "Unverified"}
                        </span>
                      </td>
                      <td className="min-w-0 max-w-[min(100%,12rem)] whitespace-normal break-words align-top text-ink-2 text-sm sm:max-w-[14rem]">
                        {row.favorite_game_name ? (
                          <button
                            type="button"
                            className="badge h-auto min-h-0 max-w-full cursor-pointer items-start justify-start whitespace-normal break-words rounded-lg py-1 text-left leading-snug transition-opacity hover:opacity-90 bg-surface-3 text-ink-1"
                            title={row.favorite_game_name}
                            onClick={() =>
                              copyDashboardCell(row.favorite_game_name, toast, "Favorite game")
                            }
                          >
                            {row.favorite_game_name}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <span className={`badge ${row.is_flagged ? "bg-danger-muted text-danger" : "bg-success-muted text-success"}`}>
                          {row.is_flagged ? "⚑ Flagged" : "✓ Clean"}
                        </span>
                      </td>
                      <td>
                        {canEdit ? (
                          <button
                            type="button"
                            className={`badge cursor-pointer transition-opacity hover:opacity-90 ${row.contacted ? "bg-accent/15 text-accent" : "bg-surface-3 text-ink-3"}`}
                            title={row.contacted ? "Marked contacted — click to change" : "Mark as contacted"}
                            onClick={() => requestContactedToggle(row)}
                          >
                            {row.contacted ? "Yes" : "No"}
                          </button>
                        ) : (
                          <span className={`badge ${row.contacted ? "bg-accent/15 text-accent" : "bg-surface-3 text-ink-3"}`}>
                            {row.contacted ? "Yes" : "No"}
                          </span>
                        )}
                      </td>
                      <td>
                        {canEdit ? (
                          <button
                            type="button"
                            className={`badge cursor-pointer transition-opacity hover:opacity-90 ${row.has_replied ? "bg-accent/15 text-accent" : "bg-surface-3 text-ink-3"} ${!row.contacted && !row.has_replied ? "opacity-60" : ""}`}
                            title={
                              !row.contacted && !row.has_replied
                                ? "Mark contacted first — click for details"
                                : row.has_replied
                                  ? "Has replied — click to change"
                                  : "Mark has replied"
                            }
                            onClick={() => requestHasRepliedToggle(row)}
                          >
                            {row.has_replied ? "Yes" : "No"}
                          </button>
                        ) : (
                          <span className={`badge ${row.has_replied ? "bg-accent/15 text-accent" : "bg-surface-3 text-ink-3"}`}>
                            {row.has_replied ? "Yes" : "No"}
                          </span>
                        )}
                      </td>
                      <td>
                        {canEdit ? (
                          <button
                            type="button"
                            className={`badge cursor-pointer transition-opacity hover:opacity-90 ${row.bonus_granted ? "bg-accent/15 text-accent" : "bg-surface-3 text-ink-3"} ${!row.contacted || !row.has_replied ? "opacity-60" : ""}`}
                            title={
                              !row.contacted || !row.has_replied
                                ? "Mark contacted and has replied first — click for details"
                                : row.bonus_granted
                                  ? "Bonus recorded — click to change"
                                  : "Mark bonus granted"
                            }
                            onClick={() => requestBonusToggle(row)}
                          >
                            {row.bonus_granted ? "Yes" : "No"}
                          </button>
                        ) : (
                          <span className={`badge ${row.bonus_granted ? "bg-accent/15 text-accent" : "bg-surface-3 text-ink-3"}`}>
                            {row.bonus_granted ? "Yes" : "No"}
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm gap-1 text-ink-3 hover:text-accent"
                          onClick={() => openDetails(row.id)}
                        >
                          <IconEye size={14} />
                          Show details
                        </button>
                      </td>
                      {(canEdit || canDelete || canVerify) && (
                        <td>
                          <div className="flex gap-1">
                            {canEdit && (
                              <>
                                <button className="p-1.5 rounded-md text-ink-4 hover:text-ink-1 hover:bg-surface-3 transition-colors" title="Edit" onClick={() => setEditRow(row)}>
                                  <IconEdit />
                                </button>
                                <button className="p-1.5 rounded-md text-ink-4 hover:text-warn hover:bg-warn-muted transition-colors" title="Toggle flag" onClick={() => handleToggleFlag(row)}>
                                  <IconFlag />
                                </button>
                              </>
                            )}
                            {canVerify && (
                              <button
                                className={`p-1.5 rounded-md transition-colors ${row.verified ? "text-accent hover:bg-danger-muted hover:text-danger" : "text-danger hover:bg-accent/10 hover:text-accent"}`}
                                title={row.verified ? "Remove verification" : "Mark as verified"}
                                onClick={() => setVerifyRow(row)}
                              >
                                <IconShieldCheck />
                              </button>
                            )}
                            {canDelete && (
                              <button className="p-1.5 rounded-md text-ink-4 hover:text-danger hover:bg-danger-muted transition-colors" title="Delete" onClick={() => setDeleteRow(row)}>
                                <IconTrash />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-col gap-3 border-t border-surface-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span className="text-xs text-ink-4">
              {data.length} of {total} records
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                className="btn btn-ghost btn-sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                <IconChevLeft /> Prev
              </button>
              <span className="px-3 py-1.5 text-xs text-ink-3">
                {page + 1} / {totalPages || 1}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
              >
                Next <IconChevRight />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editRow && (
        <EditModal row={editRow} onClose={() => setEditRow(null)} onSave={handleEditSave} />
      )}

      {detailsOpen && (
        <CustomerDetailsModal
          row={detailsRow}
          loading={detailsLoading}
          errorMessage={detailsError}
          onClose={closeDetails}
        />
      )}

      {/* Delete Confirm */}
      {deleteRow && (
        <Modal
          title="Confirm Delete"
          onClose={() => setDeleteRow(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteRow(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </>
          }
        >
          <p className="text-sm text-ink-2 leading-relaxed">
            Permanently delete the response from <strong className="text-ink-1">{deleteRow.name}</strong>?
            This will be recorded in the audit log.
          </p>
        </Modal>
      )}

      {/* Verify Confirm */}
      {verifyRow && (
        <Modal
          title={verifyRow.verified ? "Remove Verification" : "Confirm Verification"}
          onClose={() => setVerifyRow(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setVerifyRow(null)}>Cancel</button>
              <button
                className={`btn ${verifyRow.verified ? "btn-danger" : "btn-primary"}`}
                onClick={handleToggleVerify}
              >
                {verifyRow.verified ? "Remove Verification" : "Mark as Verified"}
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-2 leading-relaxed">
            {verifyRow.verified ? (
              <>Remove verification from <strong className="text-ink-1">{verifyRow.name}</strong>? Their phone number will be marked as unverified.</>
            ) : (
              <>Mark <strong className="text-ink-1">{verifyRow.name}</strong> as verified? This confirms their phone number has been validated.</>
            )}
          </p>
          <p className="text-xs text-ink-4 mt-2">This action will be recorded in the audit log.</p>
        </Modal>
      )}

      {confirmLeadToggle && (
        <Modal
          title={
            confirmLeadToggle.field === "bonus_granted"
              ? confirmLeadToggle.next
                ? "Confirm bonus granted"
                : "Clear bonus granted"
              : confirmLeadToggle.field === "has_replied"
                ? confirmLeadToggle.next
                  ? "Confirm has replied"
                  : "Clear has replied"
                : confirmLeadToggle.next
                  ? "Confirm contacted"
                  : "Clear contacted"
          }
          onClose={() => setConfirmLeadToggle(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmLeadToggle(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleConfirmLeadToggle}>
                Confirm
              </button>
            </>
          }
        >
          <LeadFieldConfirmBody toggle={confirmLeadToggle} />
        </Modal>
      )}
    </>
  );
}

/** DB pool: leads iff not has_replied (see leads/customers sync trigger). */
function membershipPoolFromRowState({ has_replied }) {
  return Boolean(has_replied) ? "customers" : "leads";
}

function membershipPool(row) {
  return membershipPoolFromRowState(row);
}

function rowAfterLeadFieldUpdate(row, field, next) {
  const c0 = Boolean(row.contacted);
  const h0 = Boolean(row.has_replied);
  const b0 = Boolean(row.bonus_granted);
  if (field === "contacted") {
    const c1 = Boolean(next);
    const h1 = c1 ? h0 : false;
    const b1 = c1 && h1 ? b0 : false;
    return { contacted: c1, has_replied: h1, bonus_granted: b1 };
  }
  if (field === "has_replied") {
    const h1 = Boolean(next);
    const b1 = h1 ? b0 : false;
    return { contacted: c0, has_replied: h1, bonus_granted: b1 };
  }
  if (field === "bonus_granted") {
    return { contacted: c0, has_replied: h0, bonus_granted: Boolean(next) };
  }
  return { contacted: c0, has_replied: h0, bonus_granted: b0 };
}

function LeadFieldConfirmBody({ toggle }) {
  const { row, field, next } = toggle;
  const nm = row.name || "this lead";
  if (field === "bonus_granted") {
    return next ? (
      <p className="text-sm text-ink-2 leading-relaxed">
        Record <strong className="text-ink-1">bonus granted</strong> for <strong className="text-ink-1">{nm}</strong>?
        The Customers list is based on <strong className="text-ink-1">has replied</strong> only; this only records bonus.
      </p>
    ) : (
      <p className="text-sm text-ink-2 leading-relaxed">
        Clear <strong className="text-ink-1">bonus granted</strong> for <strong className="text-ink-1">{nm}</strong>?
      </p>
    );
  }
  if (field === "has_replied") {
    return next ? (
      <p className="text-sm text-ink-2 leading-relaxed">
        Mark <strong className="text-ink-1">{nm}</strong> as <strong className="text-ink-1">has replied</strong>?
        They will move to the Customers list.
      </p>
    ) : (
      <p className="text-sm text-ink-2 leading-relaxed">
        Clear <strong className="text-ink-1">has replied</strong> for <strong className="text-ink-1">{nm}</strong>?
        {row.bonus_granted ? (
          <>
            {" "}
            <strong className="text-ink-1">Bonus granted</strong> will be cleared automatically because a bonus cannot stay on without has replied.
          </>
        ) : null}{" "}
        They may return to Leads when has replied is no longer set.
      </p>
    );
  }
  return next ? (
    <p className="text-sm text-ink-2 leading-relaxed">
      Mark <strong className="text-ink-1">{nm}</strong> as <strong className="text-ink-1">contacted</strong>?
      After this, you can mark <strong className="text-ink-1">has replied</strong> when they respond.
    </p>
  ) : (
    <p className="text-sm text-ink-2 leading-relaxed">
      Clear <strong className="text-ink-1">contacted</strong> for <strong className="text-ink-1">{nm}</strong>?
      {row.bonus_granted || row.has_replied ? (
        <>
          {" "}
          <strong className="text-ink-1">Has replied</strong>
          {row.bonus_granted ? (
            <>
              {" "}
              and <strong className="text-ink-1">bonus granted</strong>
            </>
          ) : null}{" "}
          will be cleared automatically because those require contacted.
        </>
      ) : null}{" "}
      They may return to Leads when has replied is no longer set.
    </p>
  );
}

function StatCard({ label, value, sub, valueColor = "text-ink-1" }) {
  return (
    <div className="card px-5 py-4">
      <div className="text-[11px] font-semibold text-ink-4 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold mt-1.5 tracking-tight ${valueColor}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && <div className="text-[11px] text-ink-4 mt-1">{sub}</div>}
    </div>
  );
}

function isParsableInstant(value) {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return false;
  const t = Date.parse(value);
  return !Number.isNaN(t);
}

/** Calendar-style local time, easy to scan (e.g. Apr 15, 2026, 2:30 PM). */
function formatFriendlyAbsolute(d) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/** Short relative phrase for recent times; omit for very old dates to reduce noise. */
function formatFriendlyRelative(d) {
  const now = Date.now();
  const diffMs = d.getTime() - now;
  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absMs < 45 * 1000) return "just now";
  if (absMs < hour) return rtf.format(Math.round(diffMs / minute), "minute");
  if (absMs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  if (absMs < 14 * day) return rtf.format(Math.round(diffMs / day), "day");
  if (absMs < 60 * day) return rtf.format(Math.round(diffMs / (7 * day)), "week");
  return null;
}

function formatFriendlyDateTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return typeof value === "string" ? value : "—";
  const abs = formatFriendlyAbsolute(d);
  const rel = formatFriendlyRelative(d);
  return rel ? `${abs} · ${rel}` : abs;
}

function formatDisplayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatFriendlyDateTime(value);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  if (typeof value === "string" && isParsableInstant(value)) {
    return formatFriendlyDateTime(value);
  }
  if (typeof value === "string") return value;
  return String(value);
}

const OMIT_FROM_LEAD_DETAILS = new Set([
  "phone_encrypted",
  "phone_hash",
  "email_encrypted",
  "email_hash",
  "favorite_game_id",
]);

function buildCustomerDetailRows(row) {
  const used = new Set(OMIT_FROM_LEAD_DETAILS);
  const push = (label, value, ...keys) => {
    for (const k of keys) {
      if (k) used.add(k);
    }
    return { label, value: formatDisplayValue(value) };
  };

  const primary = [
    push("User ID", row.user_id || row.id, "user_id", "id"),
    push("Full name", row.full_name || row.name, "full_name", "name"),
    push("Phone", row.phone, "phone"),
    push("Email", row.email, "email"),
    push("From", row.heard_from ?? row.heardFrom, "heard_from", "heardFrom"),
    push(
      "Last completed survey step",
      row.survey_last_completed_step,
      "survey_last_completed_step"
    ),
    push("Verified", row.verified, "verified"),
    push("Verified at", row.verified_at, "verified_at"),
    push("Registration step", row.registration_step, "registration_step"),
    push("Consent — marketing", row.consent_marketing, "consent_marketing"),
    push("Favorite game (display)", row.favorite_game_name || row.favorite_game || "—", "favorite_game_name", "favorite_game"),
    push("Play frequency", row.frequency, "frequency"),
    push("Flagged", row.is_flagged, "is_flagged"),
    push("Contacted", row.contacted, "contacted"),
    push("Has replied", row.has_replied, "has_replied"),
    push("Bonus granted", row.bonus_granted, "bonus_granted"),
    push("Notes", row.notes, "notes"),
    push("OTP last sent at", row.otp_last_sent_at, "otp_last_sent_at"),
    push("Created at", row.created_at ?? row.submitted_at, "created_at", "submitted_at"),
    push("Updated at", row.updated_at, "updated_at"),
    push("IP address", row.ip_address != null ? String(row.ip_address) : "—", "ip_address"),
    push("User agent", row.user_agent, "user_agent"),
  ];

  const extras = [];
  for (const [key, val] of Object.entries(row).sort(([a], [b]) => a.localeCompare(b))) {
    if (used.has(key)) continue;
    extras.push({
      label: key.replace(/_/g, " "),
      value: formatDisplayValue(val),
    });
  }

  return [...primary, ...extras];
}

function CustomerDetailsModal({ row, loading, errorMessage, onClose }) {
  const title =
    row?.name || row?.full_name
      ? `Customer — ${row.name || row.full_name}`
      : loading
        ? "Customer details"
        : "Customer details";

  return (
    <Modal
      wide
      title={title}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      {errorMessage ? (
        <p className="text-sm text-danger">{errorMessage}</p>
      ) : loading || !row ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-4">
          <div className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin" aria-hidden />
          <p className="text-sm">Loading details…</p>
        </div>
      ) : (
        <div className="max-h-[min(70vh,520px)] overflow-y-auto pr-1 -mr-1">
          <dl className="space-y-3 text-sm">
            {buildCustomerDetailRows(row).map(({ label, value }) => (
              <div key={label} className="grid gap-1 sm:grid-cols-[minmax(0,200px)_1fr] sm:gap-4">
                <dt className="font-medium text-ink-3 shrink-0">{label}</dt>
                <dd className="text-ink-1 break-words text-sm whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Modal>
  );
}

function EditModal({ row, onClose, onSave }) {
  const [name, setName] = useState(row.name);
  const [email, setEmail] = useState(row.email || "");
  const [phone, setPhone] = useState(row.phone);
  const [notes, setNotes] = useState(row.notes || "");

  return (
    <Modal
      title="Edit Response"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => onSave({ name, email: email || null, phone, notes: notes || null })}
          >
            Save Changes
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input resize-y" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
