# SQL scripts

## `Create_All.sql`

This is the **full bootstrap** for the Treasure Next.js app’s **Supabase `public` schema** (plus triggers that touch `auth.users` and `public.profiles`). Run it **once** on a new project, or after you have intentionally torn down the objects listed in `Drop_All.sql`.

**Part 1 — tables and metadata**

- Tightens default grants on `public` so anonymous clients do not get broad access.
- **`profiles`**: dashboard staff rows linked to `auth.users` (role, approval status, indexes, RLS). Intended to be long-lived; the script uses `CREATE IF NOT EXISTS` / additive alters where appropriate.
- **`audit_log`**: append-only change log (rules prevent UPDATE/DELETE), RLS, service-role inserts.
- **`rate_limit_log`**, **`rate_limit_events`**, **`otp_send_events`**: IP submission logging, distributed rate-limit counters, and per-phone OTP send events used by the survey APIs.
- **`favorite_games`**: curated survey dropdown options.
- **`users`**: marketing funnel signups (not `auth.users`) — encrypted phone/email, OTP state, survey fields, RLS. Includes `registration_step` enum.
- **`app_settings`**: single-row (`id = 1`) tunables for the game economy, survey body size, OTP caps, QA control phone, and dashboard auth rate limits.
- **`role_permission_grants`**: which dashboard roles may use each permission key.
- **`COMMENT ON`** for tables and columns so descriptions appear in Postgres / Supabase after the script runs.

**Part 2 — functions and triggers**

- Triggers on **`auth.users`** and **`public.profiles`** (new user → profile row, `updated_at`, optional delete sync).
- **`fn_audit_log`**: trigger helper that writes to `audit_log`.
- **RPCs** used by the Next.js service role: email/phone existence checks, survey phone lookup, IP submission counts, distributed rate limit check/record, OTP phone send cap, rate-limit cleanup stubs, **`get_user_role`** for JWT/session helpers.
- **`app_settings`**: `updated_at` trigger function and trigger on the settings table.
- Closing **verification `SELECT`s** (optional) to list RLS-enabled tables and policies.

**Requirements**

- Supabase (or Postgres) with **`auth`** schema present (`profiles.id` references `auth.users`).
- Run as a role that can create tables, types, functions, and policies (typically the SQL editor as postgres / service context).

**Order**

- Prefer **`Drop_All.sql` first** only when you intend to remove funnel and helper objects; then run **`Create_All.sql`**. Do not run `Drop_All` on production without a backup.

---

## `Drop_All.sql`

This script performs a **controlled teardown** of objects that **`Create_All.sql`** creates, so you can reset the funnel, rate limiting, audit append-only table, settings row structure, and related **RPCs** without touching core dashboard identity tables.

**What it drops**

- Optional legacy table **`verification_codes`** if present.
- Tables: **`role_permission_grants`**, **`app_settings`**, funnel **`users`**, enum **`registration_step`**, **`favorite_games`**, **`otp_send_events`**, **`rate_limit_events`**, **`rate_limit_log`**, **`audit_log`** (order respects dependencies; `CASCADE` removes dependent triggers on those tables).
- Standalone functions: audit helper, funnel and rate-limit RPCs, OTP helpers, `app_settings_set_updated_at`, and related signatures listed in the file.

**What it does *not* drop**

- **`public.profiles`** and the trigger functions **`handle_new_user`**, **`handle_updated_at`**, **`handle_profile_deleted`** (and their triggers) — those are considered core to auth/dashboard provisioning.
- **`public.get_user_role(uuid)`** — left in place so existing session code keeps working.

**After running**

- Re-run **`Create_All.sql`** to recreate dropped objects.
- Always **back up** before using `Drop_All.sql` on any database that contains data you care about.
