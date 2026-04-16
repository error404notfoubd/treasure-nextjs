/**
 * Short human-readable list of fields that changed (for audit list UI).
 * @param {string} table
 * @param {string} operation
 * @param {Record<string, unknown> | null} oldData
 * @param {Record<string, unknown> | null} newData
 * @returns {string | null}
 */
export function summarizeAuditUpdate(table, operation, oldData, newData) {
  if (operation !== "UPDATE" || !oldData || !newData || typeof oldData !== "object" || typeof newData !== "object") {
    return null;
  }

  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const changed = [];

  const stable = (v) => JSON.stringify(v);

  const labelFor = (key) => {
    if (table === "profiles") {
      const m = {
        role: "Role",
        status: "Status",
        full_name: "Name",
        receive_verified_lead_notifications: "Verified lead emails",
        avatar_url: "Avatar",
        email: null,
        id: null,
        created_at: "Created time",
        updated_at: null,
      };
      if (Object.prototype.hasOwnProperty.call(m, key)) return m[key];
    }
    if (table === "users") {
      const m = {
        full_name: "Name",
        phone_encrypted: "Phone",
        email_encrypted: null,
        phone_hash: "Phone (lookup)",
        email_hash: null,
        email: null,
        verified_at: "Verification time",
        otp_last_sent_at: "OTP sent time",
        registration_step: "Registration step",
        consent_marketing: "Marketing consent",
        frequency: "Play frequency",
        favorite_game_id: "Favorite game (catalog)",
        favorite_game: "Favorite game",
        is_flagged: "Flagged",
        bonus_granted: "Bonus granted",
        contacted: "Contacted",
        has_replied: "Has replied",
        notes: "Notes",
        ip_address: "IP address",
        user_agent: "User agent",
        updated_at: null,
        created_at: "Created time",
      };
      if (Object.prototype.hasOwnProperty.call(m, key)) return m[key];
    }
    if (key === "updated_at") return null;
    if (/email/i.test(String(key))) return null;
    return key.replace(/_/g, " ");
  };

  for (const key of keys) {
    if (key === "updated_at") continue;
    if (!Object.prototype.hasOwnProperty.call(newData, key) && oldData[key] === undefined) continue;
    if (stable(oldData[key]) === stable(newData[key])) continue;
    const lab = labelFor(key);
    if (lab == null || lab === "") continue;
    changed.push(lab);
  }

  if (changed.length === 0) return null;
  return [...new Set(changed)].join(", ");
}
