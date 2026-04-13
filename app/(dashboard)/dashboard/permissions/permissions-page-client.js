"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/dashboard/api-client";
import PermissionGrantsMatrix from "@/components/dashboard/permission-grants-matrix";
import { IconRefresh } from "@/components/icons";

export default function PermissionsPageClient() {
  const router = useRouter();
  const toast = useToast();
  const [grants, setGrants] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/dashboard/permission-grants");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      if (json.grants) setGrants(json.grants);
    } catch (e) {
      toast(e.message, "error");
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-surface-3/50 bg-surface-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4 lg:px-7">
        <div>
          <h2 className="text-base font-bold tracking-tight sm:text-lg">Dashboard permissions</h2>
          <p className="text-[11px] text-ink-4 mt-0.5">Owner only — who can do what in this console.</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm gap-1.5"
          onClick={load}
          disabled={loading}
          title="Reload matrix"
        >
          <IconRefresh size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6 lg:p-7">
        {loading || !grants ? (
          <div className="card p-8 text-center text-sm text-ink-4">Loading…</div>
        ) : (
          <PermissionGrantsMatrix
            grants={grants}
            toast={toast}
            onSaved={(next) => {
              setGrants(next);
              router.refresh();
            }}
          />
        )}
      </div>
    </>
  );
}
