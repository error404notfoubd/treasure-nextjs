"use client";

import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/dashboard/api-client";
import { ROLES } from "@/lib/roles";
import { PERMISSION_CATALOG, DASHBOARD_ROLES, PERMISSION_KEYS } from "@/lib/permissions-catalog";

function ensureOwnerColumn(grantsObj) {
  const out = {};
  for (const key of PERMISSION_KEYS) {
    const cur = [...(grantsObj[key] || [])];
    if (!cur.includes("owner")) cur.push("owner");
    cur.sort((a, b) => DASHBOARD_ROLES.indexOf(a) - DASHBOARD_ROLES.indexOf(b));
    out[key] = cur;
  }
  return out;
}

/**
 * @param {{ grants: Record<string, string[]>; toast: (msg: string, type?: string) => void; onSaved?: (next: Record<string, string[]>) => void }} props
 */
export default function PermissionGrantsMatrix({ grants, toast, onSaved }) {
  const [local, setLocal] = useState(() => ensureOwnerColumn(JSON.parse(JSON.stringify(grants))));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocal(ensureOwnerColumn(JSON.parse(JSON.stringify(grants))));
  }, [grants]);

  const dirty = useMemo(
    () => JSON.stringify(local) !== JSON.stringify(ensureOwnerColumn(grants)),
    [local, grants]
  );

  const toggle = (permissionKey, role) => {
    if (role === "owner") return;
    setLocal((prev) => {
      const cur = [...(prev[permissionKey] || [])];
      const i = cur.indexOf(role);
      if (i >= 0) cur.splice(i, 1);
      else cur.push(role);
      if (!cur.includes("owner")) cur.push("owner");
      cur.sort((a, b) => DASHBOARD_ROLES.indexOf(a) - DASHBOARD_ROLES.indexOf(b));
      return { ...prev, [permissionKey]: cur };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/dashboard/permission-grants", {
        method: "PATCH",
        body: JSON.stringify({ grants: local }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      toast("Permission matrix saved", "success");
      onSaved?.(json.grants);
    } catch (e) {
      toast(e.message, "error");
    }
    setSaving(false);
  };

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold mb-1">Dashboard permissions</h3>
      <p className="text-xs text-ink-4 mb-4 leading-relaxed">
        Choose which roles may perform each action. The owner column is fixed (full access) and cannot be
        changed. Only owners can edit the other roles in this matrix.
      </p>
      <div className="overflow-x-auto">
        <table className="data-table text-[12px]">
          <thead>
            <tr>
              <th className="text-left min-w-[220px]">Permission</th>
              {DASHBOARD_ROLES.map((r) => (
                <th key={r} className="text-center whitespace-nowrap px-1">
                  <span className="inline-flex flex-col items-center gap-0.5">
                    <span className="text-base leading-none">{ROLES[r]?.icon}</span>
                    <span>{ROLES[r]?.label}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_CATALOG.map(({ key, label }) => (
              <tr key={key}>
                <td className="text-ink-2">{label}</td>
                {DASHBOARD_ROLES.map((r) => (
                  <td key={r} className="text-center">
                    <input
                      type="checkbox"
                      className="accent-accent w-3.5 h-3.5"
                      checked={r === "owner" ? true : (local[key] || []).includes(r)}
                      onChange={() => toggle(key, r)}
                      disabled={r === "owner"}
                      aria-label={`${label} — ${r}`}
                      title={r === "owner" ? "Owner always has this permission; cannot be changed." : undefined}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn-primary btn-sm mt-4" onClick={save} disabled={saving || !dirty}>
        {saving ? "Saving…" : "Save permissions"}
      </button>
    </div>
  );
}
