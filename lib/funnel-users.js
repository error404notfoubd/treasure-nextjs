import {
  persistPhone,
  persistEmail,
  resolvePhoneFromDb,
  resolveEmailFromDb,
} from '@/lib/survey/contact-storage';

/** PostgREST table for funnel signups (not `auth.users`). */
export const FUNNEL_USERS_TABLE = 'users';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isFunnelUserId(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

export function persistUserPhone(e164) {
  const p = persistPhone(e164);
  return { phone_encrypted: p.phone, phone_hash: p.phone_hash };
}

export function persistUserEmail(emailPlainOrNull) {
  const p = persistEmail(emailPlainOrNull);
  return { email_encrypted: p.email, email_hash: p.email_hash };
}

/** Map DB row → dashboard / legacy UI shape (decrypt contact fields server-side). */
export function mapUserRowForDashboard(row) {
  if (!row) return row;
  return {
    ...row,
    id: row.user_id,
    name: row.full_name,
    phone: resolvePhoneFromDb(row.phone_encrypted) ?? row.phone_encrypted,
    email: resolveEmailFromDb(row.email_encrypted) ?? row.email_encrypted,
    verified: row.verified_at != null,
    submitted_at: row.created_at,
  };
}
