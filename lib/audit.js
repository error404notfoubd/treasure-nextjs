import { getDataClient } from "@/lib/supabase";
import { buildAuditChangeSummary } from "@/lib/audit-change-summary";

/**
 * Insert an entry into audit_log with proper actor attribution.
 * Silently catches errors so audit failures never break the main operation.
 * `subjectHint` is optional text prepended into change_summary when snapshots omit a display name.
 */
export async function logAction({ table, operation, rowId, oldData, newData, actor, actorRole, subjectHint }) {
  try {
    const db = getDataClient();
    const change_summary = buildAuditChangeSummary(table, operation, oldData, newData, subjectHint);
    await db.from("audit_log").insert({
      table_name: table,
      operation,
      row_id: rowId != null ? String(rowId) : null,
      old_data: oldData ?? null,
      new_data: newData ?? null,
      change_summary,
      performed_by: actorRole ? `${actor} (${actorRole})` : (actor || "system"),
    });
  } catch {
    // Audit must never break the primary operation (e.g. missing change_summary column before migration)
  }
}
