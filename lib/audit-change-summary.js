/**
 * @param {string} table
 * @param {Record<string, unknown> | null | undefined} oldData
 * @param {Record<string, unknown> | null | undefined} newData
 * @returns {string | null}
 */
function pickAuditSubjectLabel(table, oldData, newData) {
  const pick = (v) => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t : null;
  };
  const old = oldData && typeof oldData === "object" ? oldData : null;
  const neu = newData && typeof newData === "object" ? newData : null;

  const snap =
    pick(neu?.lead_snapshot?.full_name) ||
    pick(neu?.lead_snapshot?.name) ||
    pick(old?.lead_snapshot?.full_name) ||
    pick(old?.lead_snapshot?.name);
  if (snap) return snap;

  for (const key of ["full_name", "name", "title"]) {
    const a = pick(neu?.[key]);
    if (a) return a;
    const b = pick(old?.[key]);
    if (b) return b;
  }

  if (table === "profiles") {
    const email = pick(neu?.email) || pick(old?.email);
    if (email) return email;
  }

  return null;
}

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
        heard_from: "From",
        survey_last_completed_step: "Last completed survey step",
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

/**
 * Full list-line summary, including a leading subject when known (single stored string).
 * @param {string} table
 * @param {string} operation
 * @param {Record<string, unknown> | null | undefined} oldData
 * @param {Record<string, unknown> | null | undefined} newData
 * @param {string | null | undefined} subjectHint Optional label when snapshots omit a display name.
 * @returns {string | null}
 */
export function buildAuditChangeSummary(table, operation, oldData, newData, subjectHint) {
  const hinted =
    typeof subjectHint === "string" && subjectHint.trim().length > 0 ? subjectHint.trim() : null;
  const subject = hinted || pickAuditSubjectLabel(table, oldData, newData);

  if (operation === "UPDATE" && oldData && newData && typeof oldData === "object" && typeof newData === "object") {
    const fields = summarizeAuditUpdate(table, operation, oldData, newData);
    if (subject && fields) return `${subject} — ${fields}`;
    if (fields) return fields;
    if (subject) return subject;
    return null;
  }

  if (operation === "ROLE_CHANGE") {
    const old = oldData && typeof oldData === "object" ? oldData : null;
    const neu = newData && typeof newData === "object" ? newData : null;
    const rf = old?.role;
    const rt = neu?.role;
    if (subject && rf && rt) return `${subject} — ${rf} → ${rt}`;
    if (rf && rt) return `${rf} → ${rt}`;
    return subject;
  }

  if (operation === "APPROVE" || operation === "REJECT" || operation === "DELETE_USER" || operation === "PASSWORD_RESET") {
    return subject;
  }

  if (operation === "INSERT" && newData && typeof newData === "object") {
    return subject;
  }

  if (operation === "DELETE" && oldData && typeof oldData === "object") {
    return subject;
  }

  return null;
}
