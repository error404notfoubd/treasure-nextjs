import { createClient } from '@supabase/supabase-js';

// Service-role client — API routes / server only. Secret key never reaches the browser.

if (!process.env.SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
if (!process.env.SUPABASE_SECRET_KEY) throw new Error('Missing SUPABASE_SECRET_KEY');

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    db:   { schema: 'public' },
  }
);

/** Profiles, auth admin tables — same client as {@link supabase}. */
export function getAuthAdminClient() {
  return supabase;
}

/** Survey responses, audit_log, etc. — same client as {@link supabase}. */
export function getDataClient() {
  return supabase;
}
