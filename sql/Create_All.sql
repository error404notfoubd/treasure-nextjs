-- =============================================================================
--  CREATE ALL — merged single script (tables + functions).
--
--  DESCRIPTION
--  Bootstraps the app database: public schema tables (funnel users, rate limits,
--  audit log, app settings, role permissions, favorite_games), RLS policies,
--  indexes, COMMENT ON metadata, then triggers on auth/profiles and all RPCs
--  used by Next.js (survey checks, rate limits, get_user_role, audit helper).
--  Requires existing Supabase auth (profiles.id -> auth.users).
--
--  Run on a fresh database, or after sql/Drop_All.sql when intentionally resetting.
--  Replaces the former two-file flow (Create_All_tables + Create_All_functions).
-- =============================================================================

-- =============================================================================
--  PART 1 — TABLES (schema baseline through role_permission_grants)
--  Tables, types, indexes, rules, RLS, grants, COMMENT ON metadata.
--  Profile trigger/RPC bodies are in PART 2 below.
-- =============================================================================

-- SECTION: Create/00_schema_baseline.sql
-- ═══════════════════════════════════════════════════════════════════════════
--  00. SCHEMA BASELINE — least privilege; service_role + controlled access
--  Run first before any other migration file.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM anon;
REVOKE ALL ON SCHEMA public FROM authenticated;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;


-- SECTION: Create/01_profiles.sql
-- ═══════════════════════════════════════════════════════════════════════════
--  01. PROFILES — never dropped; create-if-missing, then additive alters
--  Depends on: 00_schema_baseline.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email       text        NOT NULL,
  full_name   text,
  role        text        NOT NULL DEFAULT 'viewer',
  status      text        NOT NULL DEFAULT 'pending',
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT valid_role CHECK (
    role IN ('owner', 'admin', 'editor', 'viewer')
  ),
  CONSTRAINT valid_status CHECK (
    status IN ('pending', 'approved', 'rejected')
  )
);

-- Additive column alters (safe to re-run)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'viewer',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Check constraints (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'public'
      AND r.relname = 'profiles'
      AND c.conname = 'valid_role'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'editor', 'viewer'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'public'
      AND r.relname = 'profiles'
      AND c.conname = 'valid_status'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;


-- ── Indexes ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles (status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique
  ON public.profiles (lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_name_unique
  ON public.profiles (lower(full_name))
  WHERE full_name IS NOT NULL AND full_name != '';

-- ── RLS + Policies ───────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Users can view own profile'
  ) THEN
    CREATE POLICY "Users can view own profile"
      ON public.profiles FOR SELECT
      TO authenticated
      USING (auth.uid() = id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Admins can view all profiles'
  ) THEN
    CREATE POLICY "Admins can view all profiles"
      ON public.profiles FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('owner', 'admin')
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON public.profiles FOR UPDATE
      TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Owners can update any profile'
  ) THEN
    CREATE POLICY "Owners can update any profile"
      ON public.profiles FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'owner'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Admins can update non-owner profiles'
  ) THEN
    CREATE POLICY "Admins can update non-owner profiles"
      ON public.profiles FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
        AND role != 'owner'
      );
  END IF;
END $$;


-- ── Grants ───────────────────────────────────
REVOKE ALL ON TABLE public.profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.profiles FROM anon;
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

COMMENT ON TABLE public.profiles IS 'Dashboard staff profile; one row per auth.users with role and approval status.';
COMMENT ON COLUMN public.profiles.id IS 'Primary key; matches auth.users.id (FK ON DELETE CASCADE).';
COMMENT ON COLUMN public.profiles.email IS 'Login email copied from auth at signup.';
COMMENT ON COLUMN public.profiles.full_name IS 'Display name for the management UI.';
COMMENT ON COLUMN public.profiles.role IS 'Access level: owner, admin, editor, or viewer.';
COMMENT ON COLUMN public.profiles.status IS 'Signup approval: pending, approved, or rejected.';
COMMENT ON COLUMN public.profiles.avatar_url IS 'Optional profile image URL.';
COMMENT ON COLUMN public.profiles.created_at IS 'Row creation time.';
COMMENT ON COLUMN public.profiles.updated_at IS 'Last profile update (trigger-maintained).';


-- SECTION: Create/04_audit_log.sql
-- ═══════════════════════════════════════════════════════════════════════════
--  04. AUDIT LOG — append-only via rules; row_id as text
--  Depends on: 00_schema_baseline.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.audit_log (
  id               bigserial    PRIMARY KEY,
  table_name       text         NOT NULL,
  operation        text         NOT NULL,
  row_id           text,
  old_data         jsonb,
  new_data         jsonb,
  change_summary   text,
  performed_at     timestamptz  NOT NULL DEFAULT now(),
  performed_by     text         NOT NULL DEFAULT current_user
);

ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS change_summary text;

ALTER TABLE public.audit_log
  ALTER COLUMN row_id TYPE text USING row_id::text;


-- ── Append-only rules ────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_rules
    WHERE schemaname = 'public'
      AND tablename = 'audit_log'
      AND rulename = 'audit_no_update'
  ) THEN
    CREATE RULE audit_no_update AS ON UPDATE TO public.audit_log DO INSTEAD NOTHING;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_rules
    WHERE schemaname = 'public'
      AND tablename = 'audit_log'
      AND rulename = 'audit_no_delete'
  ) THEN
    CREATE RULE audit_no_delete AS ON DELETE TO public.audit_log DO INSTEAD NOTHING;
  END IF;
END $$;


-- ── RLS + Grants ─────────────────────────────
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_log'
      AND policyname = 'deny_anon_all_audit'
  ) THEN
    CREATE POLICY deny_anon_all_audit
      ON public.audit_log AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE public.audit_log FROM PUBLIC;
REVOKE ALL ON TABLE public.audit_log FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO service_role;

COMMENT ON TABLE public.audit_log IS 'Append-only audit trail of sensitive row changes (service_role writes).';
COMMENT ON COLUMN public.audit_log.id IS 'Surrogate key (bigserial).';
COMMENT ON COLUMN public.audit_log.table_name IS 'Source table name for the change.';
COMMENT ON COLUMN public.audit_log.operation IS 'INSERT, UPDATE, or DELETE.';
COMMENT ON COLUMN public.audit_log.row_id IS 'Primary key or identifier of the affected row as text.';
COMMENT ON COLUMN public.audit_log.old_data IS 'Row snapshot before change (JSONB); null on INSERT.';
COMMENT ON COLUMN public.audit_log.new_data IS 'Row snapshot after change (JSONB); null on DELETE.';
COMMENT ON COLUMN public.audit_log.performed_at IS 'When the change was recorded.';
COMMENT ON COLUMN public.audit_log.performed_by IS 'Database role or label that performed the action.';
COMMENT ON COLUMN public.audit_log.change_summary IS 'Short list of fields changed on UPDATE (for list UI).';

-- SECTION: Create/05_rate_limit_log.sql
-- ═══════════════════════════════════════════════════════════════════════════
--  05. RATE LIMIT LOG — submission / IP tracking
--  Depends on: 00_schema_baseline.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id           bigserial   PRIMARY KEY,
  ip_address   inet        NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success      boolean     NOT NULL DEFAULT false
);


-- ── Indexes ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rate_ip_time
  ON public.rate_limit_log (ip_address, attempted_at DESC);


-- ── RLS + Grants ─────────────────────────────
ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rate_limit_log'
      AND policyname = 'deny_anon_all_rate'
  ) THEN
    CREATE POLICY deny_anon_all_rate
      ON public.rate_limit_log AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE public.rate_limit_log FROM PUBLIC;
REVOKE ALL ON TABLE public.rate_limit_log FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.rate_limit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rate_limit_log_id_seq TO service_role;

COMMENT ON TABLE public.rate_limit_log IS 'Successful survey submissions per IP (used with fn_ip_submission_count).';
COMMENT ON COLUMN public.rate_limit_log.id IS 'Surrogate key (bigserial).';
COMMENT ON COLUMN public.rate_limit_log.ip_address IS 'Client IP when the submission was logged.';
COMMENT ON COLUMN public.rate_limit_log.attempted_at IS 'Timestamp of the attempt.';
COMMENT ON COLUMN public.rate_limit_log.success IS 'True when the survey POST completed successfully.';

-- SECTION: Create/06_rate_limit_events.sql
-- ═══════════════════════════════════════════════════════════════════════════
--  06. RATE LIMIT EVENTS — per-IP per-route; serverless-safe
--  Depends on: 00_schema_baseline.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id           bigserial   PRIMARY KEY,
  ip_address   inet        NOT NULL,
  route        text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);


-- ── Indexes ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rate_events_ip_route_time
  ON public.rate_limit_events (ip_address, route, created_at DESC);


-- ── RLS + Grants ─────────────────────────────
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rate_limit_events'
      AND policyname = 'deny_anon_all_rate_events'
  ) THEN
    CREATE POLICY deny_anon_all_rate_events
      ON public.rate_limit_events AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE public.rate_limit_events FROM PUBLIC;
REVOKE ALL ON TABLE public.rate_limit_events FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.rate_limit_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rate_limit_events_id_seq TO service_role;

COMMENT ON TABLE public.rate_limit_events IS 'Distributed per-IP per-route rate limit events (serverless-safe).';
COMMENT ON COLUMN public.rate_limit_events.id IS 'Surrogate key (bigserial).';
COMMENT ON COLUMN public.rate_limit_events.ip_address IS 'Client IP for this counted request.';
COMMENT ON COLUMN public.rate_limit_events.route IS 'Logical route key (e.g. survey_post, survey_sms_send).';
COMMENT ON COLUMN public.rate_limit_events.created_at IS 'When this event was recorded for sliding-window counts.';

-- ═══════════════════════════════════════════════════════════════════════════
--  OTP send events — per phone_hash rolling window (Prelude SMS cap)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.otp_send_events (
  id          bigserial   PRIMARY KEY,
  phone_hash  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_send_phone_time
  ON public.otp_send_events (phone_hash, created_at DESC);

ALTER TABLE public.otp_send_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'otp_send_events'
      AND policyname = 'deny_anon_all_otp_send_events'
  ) THEN
    CREATE POLICY deny_anon_all_otp_send_events
      ON public.otp_send_events AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE public.otp_send_events FROM PUBLIC;
REVOKE ALL ON TABLE public.otp_send_events FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.otp_send_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.otp_send_events_id_seq TO service_role;

COMMENT ON TABLE public.otp_send_events IS 'Per-phone-hash OTP send events for rolling per-number caps (fn_check_and_record_otp_phone_send).';
COMMENT ON COLUMN public.otp_send_events.id IS 'Surrogate key (bigserial).';
COMMENT ON COLUMN public.otp_send_events.phone_hash IS 'Opaque hash of E.164; groups sends per handset.';
COMMENT ON COLUMN public.otp_send_events.created_at IS 'When this send was allowed and recorded.';

-- SECTION: Create/09b_favorite_games.sql
-- ═══════════════════════════════════════════════════════════════════════════
--  Survey catalog: favorite third-party / sweepstakes-style games (dropdown).
--  Optional FK from public.users.favorite_game_id; display text in favorite_game.
--  Run before Create/10_users.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.favorite_games (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT favorite_games_name_len CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT favorite_games_name_unique UNIQUE (name)
);

ALTER TABLE public.favorite_games ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'favorite_games'
      AND policyname = 'deny_anon_all_favorite_games'
  ) THEN
    CREATE POLICY deny_anon_all_favorite_games
      ON public.favorite_games AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE public.favorite_games FROM PUBLIC;
REVOKE ALL ON TABLE public.favorite_games FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.favorite_games TO service_role;

COMMENT ON TABLE public.favorite_games IS 'Curated list of favorite-game labels for the survey dropdown.';
COMMENT ON COLUMN public.favorite_games.id IS 'Stable UUID for catalog rows.';
COMMENT ON COLUMN public.favorite_games.name IS 'Display label shown in survey and dashboard.';
COMMENT ON COLUMN public.favorite_games.sort_order IS 'Ascending sort order in dropdowns.';
COMMENT ON COLUMN public.favorite_games.is_active IS 'When false, name is hidden from new survey picks.';
COMMENT ON COLUMN public.favorite_games.created_at IS 'When this catalog row was inserted.';

INSERT INTO public.favorite_games (name, sort_order) VALUES
  ('Juwa', 10),
  ('Fire Kirin', 20),
  ('Orion Stars', 30),
  ('Game Vault', 40),
  ('Ultra Panda', 50),
  ('Milky Way', 60),
  ('Cash Frenzy', 70)
ON CONFLICT (name) DO NOTHING;


-- SECTION: Create/10_users.sql
-- ═══════════════════════════════════════════════════════════════════════════
--  10. FUNNEL USERS — gamified acquisition (game + dashboard; not auth.users)
--  Depends on: 00_schema_baseline.sql
--  Referenced by RPCs in PART 2 (fn_email_exists, fn_phone_exists, etc.).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  CREATE TYPE public.registration_step AS ENUM (
    'viewed',
    'started',
    'submitted',
    'verified'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.users (
  user_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           text NOT NULL,
  phone_hash          text NOT NULL,
  phone_encrypted     text NOT NULL,
  email_hash          text,
  email_encrypted     text,
  verified_at         timestamptz,
  otp_last_sent_at    timestamptz,
  registration_step   public.registration_step NOT NULL DEFAULT 'submitted',
  consent_marketing   boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  frequency           text,
  favorite_game_id    uuid REFERENCES public.favorite_games (id) ON DELETE SET NULL,
  favorite_game       text,
  is_flagged          boolean NOT NULL DEFAULT false,
  bonus_granted       boolean NOT NULL DEFAULT false,
  contacted           boolean NOT NULL DEFAULT false,
  notes               text,
  ip_address          inet,
  user_agent          text,

  CONSTRAINT users_full_name_len CHECK (char_length(full_name) BETWEEN 2 AND 120),
  CONSTRAINT users_phone_enc_len CHECK (char_length(phone_encrypted) BETWEEN 7 AND 4096),
  CONSTRAINT users_email_enc_len CHECK (
    email_encrypted IS NULL OR (char_length(email_encrypted) BETWEEN 1 AND 4096)
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'public'
      AND r.relname = 'users'
      AND c.conname = 'users_frequency_values'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_frequency_values CHECK (
        frequency IS NULL OR frequency = '' OR frequency IN (
          'Daily — multiple times a day',
          'Daily — once a day',
          'A few times a week',
          'Once a week',
          'A few times a month',
          'Rarely'
        )
      );
  END IF;
END $$;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bonus_granted boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS contacted boolean NOT NULL DEFAULT false;

DROP INDEX IF EXISTS idx_users_email_hash_verified;
CREATE UNIQUE INDEX idx_users_email_hash_verified
  ON public.users (email_hash)
  WHERE email_hash IS NOT NULL AND verified_at IS NOT NULL;

DROP INDEX IF EXISTS idx_users_phone_hash_verified;
CREATE UNIQUE INDEX idx_users_phone_hash_verified
  ON public.users (phone_hash)
  WHERE verified_at IS NOT NULL;

DROP INDEX IF EXISTS idx_users_phone_unverified;
CREATE INDEX IF NOT EXISTS idx_users_phone_unverified
  ON public.users (phone_hash)
  WHERE verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_created_at
  ON public.users (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_flagged
  ON public.users (is_flagged) WHERE is_flagged = true;

CREATE INDEX IF NOT EXISTS idx_users_ip
  ON public.users (ip_address);

CREATE INDEX IF NOT EXISTS idx_users_favorite_game_id
  ON public.users (favorite_game_id)
  WHERE favorite_game_id IS NOT NULL;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND policyname = 'deny_anon_all_users'
  ) THEN
    CREATE POLICY deny_anon_all_users
      ON public.users AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE public.users FROM PUBLIC;
REVOKE ALL ON TABLE public.users FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO service_role;

-- Force lead tracking flags off on insert (even if a client omits or overrides them).
CREATE OR REPLACE FUNCTION public.users_lead_flags_false_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.bonus_granted := false;
  NEW.contacted := false;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.users_lead_flags_false_on_insert() IS 'Trigger: sets bonus_granted and contacted to false for every new public.users row.';

DROP TRIGGER IF EXISTS trg_users_lead_flags_on_insert ON public.users;
CREATE TRIGGER trg_users_lead_flags_on_insert
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_lead_flags_false_on_insert();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_bonus_requires_contacted'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_bonus_requires_contacted
      CHECK (NOT bonus_granted OR contacted);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.leads (
  user_id uuid PRIMARY KEY REFERENCES public.users (user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customers (
  user_id uuid PRIMARY KEY REFERENCES public.users (user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leads IS 'Funnel rows in the Leads queue (not contacted and no bonus); mutually exclusive with public.customers.';
COMMENT ON TABLE public.customers IS 'Funnel rows out of Leads (contacted and/or bonus); mutually exclusive with public.leads.';

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads' AND policyname = 'deny_anon_all_leads'
  ) THEN
    CREATE POLICY deny_anon_all_leads ON public.leads AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'deny_anon_all_customers'
  ) THEN
    CREATE POLICY deny_anon_all_customers ON public.customers AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE public.leads FROM PUBLIC;
REVOKE ALL ON TABLE public.leads FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leads TO service_role;

REVOKE ALL ON TABLE public.customers FROM PUBLIC;
REVOKE ALL ON TABLE public.customers FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customers TO service_role;

CREATE OR REPLACE FUNCTION public.sync_users_pool_membership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  in_leads boolean;
BEGIN
  in_leads := (NOT COALESCE(NEW.contacted, false)) AND (NOT COALESCE(NEW.bonus_granted, false));

  IF in_leads THEN
    DELETE FROM public.customers WHERE user_id = NEW.user_id;
    INSERT INTO public.leads (user_id) VALUES (NEW.user_id)
      ON CONFLICT (user_id) DO NOTHING;
  ELSE
    DELETE FROM public.leads WHERE user_id = NEW.user_id;
    INSERT INTO public.customers (user_id) VALUES (NEW.user_id)
      ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_users_pool_membership() IS
  'Keeps public.leads vs public.customers mutually exclusive from users.contacted / bonus_granted.';

DROP TRIGGER IF EXISTS trg_users_sync_pool_membership ON public.users;
CREATE TRIGGER trg_users_sync_pool_membership
  AFTER INSERT OR UPDATE OF contacted, bonus_granted ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_users_pool_membership();

CREATE OR REPLACE FUNCTION public.fn_pool_user_ids_page(
  p_pool text,
  p_limit int,
  p_offset int,
  p_flagged_only boolean,
  p_name_pattern text,
  p_email_hash text,
  p_phone_hash text
)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_pool IS NULL OR lower(p_pool) NOT IN ('leads', 'customers') THEN
    RAISE EXCEPTION 'fn_pool_user_ids_page: p_pool must be leads or customers';
  END IF;

  IF lower(p_pool) = 'leads' THEN
    RETURN QUERY
    SELECT u.user_id
    FROM public.leads l
    INNER JOIN public.users u ON u.user_id = l.user_id
    WHERE (NOT p_flagged_only OR u.is_flagged)
      AND (
        (p_name_pattern IS NULL AND p_email_hash IS NULL AND p_phone_hash IS NULL)
        OR (p_name_pattern IS NOT NULL AND u.full_name ILIKE p_name_pattern)
        OR (p_email_hash IS NOT NULL AND u.email_hash = p_email_hash)
        OR (p_phone_hash IS NOT NULL AND u.phone_hash = p_phone_hash)
      )
    ORDER BY u.created_at DESC
    LIMIT p_limit OFFSET p_offset;
  ELSE
    RETURN QUERY
    SELECT u.user_id
    FROM public.customers c
    INNER JOIN public.users u ON u.user_id = c.user_id
    WHERE (NOT p_flagged_only OR u.is_flagged)
      AND (
        (p_name_pattern IS NULL AND p_email_hash IS NULL AND p_phone_hash IS NULL)
        OR (p_name_pattern IS NOT NULL AND u.full_name ILIKE p_name_pattern)
        OR (p_email_hash IS NOT NULL AND u.email_hash = p_email_hash)
        OR (p_phone_hash IS NOT NULL AND u.phone_hash = p_phone_hash)
      )
    ORDER BY u.created_at DESC
    LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_pool_user_ids_count(
  p_pool text,
  p_flagged_only boolean,
  p_name_pattern text,
  p_email_hash text,
  p_phone_hash text
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  n bigint;
BEGIN
  IF p_pool IS NULL OR lower(p_pool) NOT IN ('leads', 'customers') THEN
    RAISE EXCEPTION 'fn_pool_user_ids_count: p_pool must be leads or customers';
  END IF;

  IF lower(p_pool) = 'leads' THEN
    SELECT count(*)::bigint INTO n
    FROM public.leads l
    INNER JOIN public.users u ON u.user_id = l.user_id
    WHERE (NOT p_flagged_only OR u.is_flagged)
      AND (
        (p_name_pattern IS NULL AND p_email_hash IS NULL AND p_phone_hash IS NULL)
        OR (p_name_pattern IS NOT NULL AND u.full_name ILIKE p_name_pattern)
        OR (p_email_hash IS NOT NULL AND u.email_hash = p_email_hash)
        OR (p_phone_hash IS NOT NULL AND u.phone_hash = p_phone_hash)
      );
  ELSE
    SELECT count(*)::bigint INTO n
    FROM public.customers c
    INNER JOIN public.users u ON u.user_id = c.user_id
    WHERE (NOT p_flagged_only OR u.is_flagged)
      AND (
        (p_name_pattern IS NULL AND p_email_hash IS NULL AND p_phone_hash IS NULL)
        OR (p_name_pattern IS NOT NULL AND u.full_name ILIKE p_name_pattern)
        OR (p_email_hash IS NOT NULL AND u.email_hash = p_email_hash)
        OR (p_phone_hash IS NOT NULL AND u.phone_hash = p_phone_hash)
      );
  END IF;

  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_pool_user_ids_page(text, int, int, boolean, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pool_user_ids_count(text, boolean, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.fn_pool_user_ids_page(text, int, int, boolean, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_pool_user_ids_count(text, boolean, text, text, text) FROM PUBLIC;

DELETE FROM public.customers c
USING public.users u
WHERE c.user_id = u.user_id
  AND (NOT COALESCE(u.contacted, false))
  AND (NOT COALESCE(u.bonus_granted, false));

DELETE FROM public.leads l
USING public.users u
WHERE l.user_id = u.user_id
  AND (COALESCE(u.contacted, false) OR COALESCE(u.bonus_granted, false));

INSERT INTO public.leads (user_id)
SELECT u.user_id
FROM public.users u
WHERE (NOT COALESCE(u.contacted, false)) AND (NOT COALESCE(u.bonus_granted, false))
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.customers (user_id)
SELECT u.user_id
FROM public.users u
WHERE COALESCE(u.contacted, false) OR COALESCE(u.bonus_granted, false)
ON CONFLICT (user_id) DO NOTHING;

COMMENT ON TYPE public.registration_step IS 'Funnel stage for marketing survey signups on public.users.';

COMMENT ON TABLE public.users IS 'Marketing funnel signups (not auth.users): survey answers, encrypted contact, OTP verification.';
COMMENT ON COLUMN public.users.user_id IS 'Primary key for this funnel row; referenced by survey session JWT.';
COMMENT ON COLUMN public.users.full_name IS 'Display name from the survey.';
COMMENT ON COLUMN public.users.phone_hash IS 'Opaque hash of E.164 for uniqueness and lookups without decrypting.';
COMMENT ON COLUMN public.users.phone_encrypted IS 'Application-encrypted E.164 for authorized staff display.';
COMMENT ON COLUMN public.users.email_hash IS 'Opaque hash of normalized email when provided; null if none.';
COMMENT ON COLUMN public.users.email_encrypted IS 'Application-encrypted email when provided; null if none.';
COMMENT ON COLUMN public.users.verified_at IS 'When phone OTP verification succeeded; null until verified.';
COMMENT ON COLUMN public.users.otp_last_sent_at IS 'Last verification SMS send time (resend cooldown).';
COMMENT ON COLUMN public.users.registration_step IS 'Funnel progress: viewed, started, submitted, verified.';
COMMENT ON COLUMN public.users.consent_marketing IS 'Whether the user opted in to marketing on the survey.';
COMMENT ON COLUMN public.users.created_at IS 'First submission / row insert time.';
COMMENT ON COLUMN public.users.updated_at IS 'Last update to this row.';
COMMENT ON COLUMN public.users.frequency IS 'Self-reported play frequency label; null if not answered.';
COMMENT ON COLUMN public.users.favorite_game_id IS 'Optional FK to favorite_games for legacy or catalog-backed picks.';
COMMENT ON COLUMN public.users.favorite_game IS 'Favorite game display text (catalog name or free-text other).';
COMMENT ON COLUMN public.users.is_flagged IS 'Staff flag for review in the leads dashboard.';
COMMENT ON COLUMN public.users.bonus_granted IS 'Whether staff has recorded a bonus for this lead; reset to false on new survey row.';
COMMENT ON COLUMN public.users.contacted IS 'Whether staff has contacted this lead; reset to false on new survey row.';
COMMENT ON COLUMN public.users.notes IS 'Internal staff notes.';
COMMENT ON COLUMN public.users.ip_address IS 'Client IP at submission (inet).';
COMMENT ON COLUMN public.users.user_agent IS 'Truncated User-Agent header at submission.';

-- SECTION: Create/11_app_settings.sql
-- ═══════════════════════════════════════════════════════════════════════════
--  11. APP SETTINGS — single-row tunables (game economy, auth, survey caps)
--  Depends on: 00_schema_baseline.sql
--  Read/write via service_role only (Next.js API + dashboard owner UI).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  start_credits integer NOT NULL DEFAULT 15,
  bonus_credits integer NOT NULL DEFAULT 100,
  rtp smallint NOT NULL DEFAULT 50,
  jackpot_rate smallint NOT NULL DEFAULT 0,
  four_of_a_kind_rate smallint NOT NULL DEFAULT 3,
  symbol_weights jsonb NOT NULL DEFAULT '{"key":28,"crystal":20,"map":18,"compass":16,"shield":12,"scroll":9,"star":6}'::jsonb,
  find_payouts jsonb NOT NULL DEFAULT '{"great_find":4,"good_find":2}'::jsonb,
  bet_presets jsonb NOT NULL DEFAULT '[1,5,10,15,25,50]'::jsonb,
  reel_stop_delays jsonb NOT NULL DEFAULT '[860,1100,1340,1580,1820]'::jsonb,

  survey_request_body_max_chars integer NOT NULL DEFAULT 8192,
  otp_sends_per_phone_max integer NOT NULL DEFAULT 3,
  otp_sends_per_phone_window_ms bigint NOT NULL DEFAULT 3600000,
  survey_control_phone_e164 text,

  login_rate_limit_max_per_window integer NOT NULL DEFAULT 15,
  login_rate_limit_window_ms integer NOT NULL DEFAULT 60000,
  signup_rate_limit_max_per_window integer NOT NULL DEFAULT 10,
  -- Milliseconds; bigint so values up to 30 days (2_592_000_000) fit (exceeds int4 max).
  signup_rate_limit_window_ms bigint NOT NULL DEFAULT 3600000,
  check_availability_max_per_window integer NOT NULL DEFAULT 20,
  check_availability_window_ms integer NOT NULL DEFAULT 60000,
  password_min_length smallint NOT NULL DEFAULT 8,
  default_signup_role text NOT NULL DEFAULT 'viewer',
  auth_ui_check_debounce_ms integer NOT NULL DEFAULT 500,

  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT app_settings_start_credits_nonneg CHECK (start_credits >= 0 AND start_credits <= 100000),
  CONSTRAINT app_settings_bonus_credits_nonneg CHECK (bonus_credits >= 0 AND bonus_credits <= 100000),
  CONSTRAINT app_settings_rtp CHECK (rtp >= 0 AND rtp <= 100),
  CONSTRAINT app_settings_rates CHECK (
    jackpot_rate >= 0 AND jackpot_rate <= 100
    AND four_of_a_kind_rate >= 0 AND four_of_a_kind_rate <= 100
  ),
  CONSTRAINT app_settings_survey_body CHECK (survey_request_body_max_chars >= 1024 AND survey_request_body_max_chars <= 1048576),
  CONSTRAINT app_settings_otp CHECK (
    otp_sends_per_phone_max >= 1 AND otp_sends_per_phone_max <= 100
    AND otp_sends_per_phone_window_ms >= 60000
    AND otp_sends_per_phone_window_ms <= (86400000::bigint * 7)
  ),
  CONSTRAINT app_settings_password_len CHECK (password_min_length >= 6 AND password_min_length <= 128),
  CONSTRAINT app_settings_default_role CHECK (default_signup_role IN ('viewer', 'editor', 'admin')),
  CONSTRAINT app_settings_debounce CHECK (auth_ui_check_debounce_ms >= 100 AND auth_ui_check_debounce_ms <= 10000),
  CONSTRAINT app_settings_login_rl CHECK (
    login_rate_limit_max_per_window >= 1 AND login_rate_limit_max_per_window <= 10000
    AND login_rate_limit_window_ms >= 1000 AND login_rate_limit_window_ms <= 86400000
  ),
  CONSTRAINT app_settings_signup_rl CHECK (
    signup_rate_limit_max_per_window >= 1 AND signup_rate_limit_max_per_window <= 10000
    AND signup_rate_limit_window_ms >= 1000
    AND signup_rate_limit_window_ms <= (86400000::bigint * 30)
  ),
  CONSTRAINT app_settings_check_rl CHECK (
    check_availability_max_per_window >= 1 AND check_availability_max_per_window <= 10000
    AND check_availability_window_ms >= 1000 AND check_availability_window_ms <= 86400000
  )
);

INSERT INTO public.app_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_settings'
      AND policyname = 'deny_anon_all_app_settings'
  ) THEN
    CREATE POLICY deny_anon_all_app_settings
      ON public.app_settings AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE public.app_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.app_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_settings TO service_role;

COMMENT ON TABLE public.app_settings IS 'Single-row tunables (id=1): game economy, survey OTP caps, auth rate limits.';
COMMENT ON COLUMN public.app_settings.id IS 'Must be 1; singleton configuration row.';
COMMENT ON COLUMN public.app_settings.start_credits IS 'Default credits for new game sessions.';
COMMENT ON COLUMN public.app_settings.bonus_credits IS 'Survey completion bonus credits.';
COMMENT ON COLUMN public.app_settings.rtp IS 'Target return-to-player percentage for the slot.';
COMMENT ON COLUMN public.app_settings.jackpot_rate IS 'Relative weight or rate for jackpot outcomes.';
COMMENT ON COLUMN public.app_settings.four_of_a_kind_rate IS 'Relative weight or rate for four-of-a-kind outcomes.';
COMMENT ON COLUMN public.app_settings.symbol_weights IS 'JSON map of reel symbol weights.';
COMMENT ON COLUMN public.app_settings.find_payouts IS 'JSON multipliers for find / bonus outcomes.';
COMMENT ON COLUMN public.app_settings.bet_presets IS 'JSON array of allowed bet amounts.';
COMMENT ON COLUMN public.app_settings.reel_stop_delays IS 'JSON array of reel stop delay timings (ms).';
COMMENT ON COLUMN public.app_settings.survey_request_body_max_chars IS 'Max JSON body size for POST /api/survey.';
COMMENT ON COLUMN public.app_settings.otp_sends_per_phone_max IS 'Max OTP SMS attempts per phone per rolling window.';
COMMENT ON COLUMN public.app_settings.otp_sends_per_phone_window_ms IS 'Rolling window length (ms) for OTP per-phone cap.';
COMMENT ON COLUMN public.app_settings.survey_control_phone_e164 IS 'Optional E.164 exempt from per-phone OTP cap (QA).';
COMMENT ON COLUMN public.app_settings.login_rate_limit_max_per_window IS 'Max login POSTs per IP per login window.';
COMMENT ON COLUMN public.app_settings.login_rate_limit_window_ms IS 'Sliding window (ms) for login rate limit.';
COMMENT ON COLUMN public.app_settings.signup_rate_limit_max_per_window IS 'Max signup POSTs per IP per signup window.';
COMMENT ON COLUMN public.app_settings.signup_rate_limit_window_ms IS 'Sliding window (ms) for signup rate limit.';
COMMENT ON COLUMN public.app_settings.check_availability_max_per_window IS 'Max username/email availability checks per IP per window.';
COMMENT ON COLUMN public.app_settings.check_availability_window_ms IS 'Sliding window (ms) for availability checks.';
COMMENT ON COLUMN public.app_settings.password_min_length IS 'Minimum password length for dashboard password rules.';
COMMENT ON COLUMN public.app_settings.default_signup_role IS 'Role assigned to new dashboard signups (viewer, editor, admin).';
COMMENT ON COLUMN public.app_settings.auth_ui_check_debounce_ms IS 'Client debounce hint for availability check calls.';
COMMENT ON COLUMN public.app_settings.updated_at IS 'Last change to this settings row.';

-- SECTION: Create/12_role_permission_grants.sql
-- ═══════════════════════════════════════════════════════════════════════════
--  12. ROLE PERMISSION GRANTS — which dashboard roles may perform each action
--  Depends on: 00_schema_baseline.sql
--  Edited only via Next.js API (owner); service_role only.
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.role_privilege_levels CASCADE;
DROP FUNCTION IF EXISTS public.role_privilege_levels_set_updated_at() CASCADE;

CREATE TABLE IF NOT EXISTS public.role_permission_grants (
  permission_key text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  PRIMARY KEY (permission_key, role)
);

INSERT INTO public.role_permission_grants (permission_key, role) VALUES
  ('view_leads', 'viewer'),
  ('view_leads', 'editor'),
  ('view_leads', 'admin'),
  ('view_leads', 'owner'),
  ('manage_games_list', 'editor'),
  ('manage_games_list', 'admin'),
  ('manage_games_list', 'owner'),
  ('edit_leads', 'editor'),
  ('edit_leads', 'admin'),
  ('edit_leads', 'owner'),
  ('verify_leads', 'admin'),
  ('verify_leads', 'owner'),
  ('delete_leads', 'admin'),
  ('delete_leads', 'owner'),
  ('approve_signups', 'admin'),
  ('approve_signups', 'owner'),
  ('manage_dashboard_users', 'admin'),
  ('manage_dashboard_users', 'owner'),
  ('view_audit', 'admin'),
  ('view_audit', 'owner'),
  ('modify_system_settings', 'owner')
ON CONFLICT DO NOTHING;

ALTER TABLE public.role_permission_grants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'role_permission_grants'
      AND policyname = 'deny_anon_all_role_permission_grants'
  ) THEN
    CREATE POLICY deny_anon_all_role_permission_grants
      ON public.role_permission_grants AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE public.role_permission_grants FROM PUBLIC;
REVOKE ALL ON TABLE public.role_permission_grants FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.role_permission_grants TO service_role;

COMMENT ON TABLE public.role_permission_grants IS 'Maps dashboard permission_key to roles that may use it (composite PK).';
COMMENT ON COLUMN public.role_permission_grants.permission_key IS 'Stable action key (e.g. view_leads, edit_leads).';
COMMENT ON COLUMN public.role_permission_grants.role IS 'Dashboard role: owner, admin, editor, or viewer.';

-- =============================================================================
--  PART 2 — FUNCTIONS & TRIGGERS
--  Profile/auth triggers, audit helper, RPCs, app_settings trigger, verification SELECTs.
-- =============================================================================

-- ── Functions ────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Role is never taken from user metadata (signUp options.data); only server defaults
  -- and admin APIs may change role after insert.
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'viewer',
    'pending'
  );
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

-- When a profile row is removed, remove the Auth user so auth.users stays in sync.
-- (Deleting auth.users already CASCADE-deletes the profile via FK; this covers the reverse.)
CREATE OR REPLACE FUNCTION public.handle_profile_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$;


-- ── Triggers ─────────────────────────────────
CREATE OR REPLACE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_profile_deleted ON public.profiles;
CREATE TRIGGER on_profile_deleted
  AFTER DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_deleted();

-- ── Trigger helper function ──────────────────
CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (table_name, operation, row_id, old_data, new_data)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    coalesce(new.id::text, old.id::text),
    CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(old) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(new) ELSE NULL END
  );
  RETURN coalesce(new, old);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_log() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_audit_log() TO service_role;
-- SECTION: Create/08_helper_functions.sql
-- ═══════════════════════════════════════════════════════════════════════════
--  08. HELPER FUNCTIONS + EXECUTE GRANTS
--  Depends on: public.profiles (01), audit/rate/otp tables (04–06), public.users (10)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = user_id;
$$;

CREATE OR REPLACE FUNCTION public.fn_email_exists(p_email_hash text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.email_hash IS NOT NULL
      AND u.email_hash = p_email_hash
      AND u.verified_at IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_phone_exists(p_phone_hash text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.phone_hash IS NOT NULL
      AND u.phone_hash = p_phone_hash
      AND u.verified_at IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_survey_latest_for_normalized_phone(p_phone_hash text)
RETURNS TABLE (user_id uuid, is_verified boolean)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT u.user_id, (u.verified_at IS NOT NULL)
  FROM public.users u
  WHERE u.phone_hash IS NOT NULL
    AND u.phone_hash = p_phone_hash
  ORDER BY u.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.fn_ip_submission_count(p_ip inet, p_mins int DEFAULT 15)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.rate_limit_log
  WHERE ip_address = p_ip
    AND success = true
    AND attempted_at > now() - (p_mins || ' minutes')::interval;
$$;

CREATE OR REPLACE FUNCTION public.fn_clean_rate_log()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limit_log
  WHERE attempted_at < now() - interval '24 hours';
$$;

CREATE OR REPLACE FUNCTION public.fn_check_and_record_rate_limit(
  p_ip          inet,
  p_route       text,
  p_max         int,
  p_window_secs int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_ip::text || '|' || p_route)::bigint);

  SELECT count(*)::int INTO cnt
  FROM public.rate_limit_events
  WHERE ip_address = p_ip
    AND route = p_route
    AND created_at > now() - (interval '1 second' * p_window_secs);

  IF cnt >= p_max THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_events (ip_address, route)
  VALUES (p_ip, p_route);

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_check_and_record_otp_phone_send(
  p_phone_hash   text,
  p_max          int,
  p_window_secs  int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('otp_phone:' || p_phone_hash)::bigint);

  SELECT count(*)::int INTO cnt
  FROM public.otp_send_events
  WHERE phone_hash = p_phone_hash
    AND created_at > now() - (interval '1 second' * p_window_secs);

  IF cnt >= p_max THEN
    RETURN false;
  END IF;

  INSERT INTO public.otp_send_events (phone_hash)
  VALUES (p_phone_hash);

  RETURN true;
END;
$$;

-- OTP caps use Prelude + public.otp_send_events (fn_check_and_record_otp_phone_send).
-- This RPC is kept for compatibility; it does not count Prelude sends (no phone in DB).
CREATE OR REPLACE FUNCTION public.fn_otp_send_count_for_phone(p_phone text, p_window_mins int)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT 0::int;
$$;

CREATE OR REPLACE FUNCTION public.fn_clean_rate_limit_events()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limit_events
  WHERE created_at < now() - interval '3 days';
$$;


-- ── Grants: service_role only ────────────────
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_email_exists(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_phone_exists(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_survey_latest_for_normalized_phone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_ip_submission_count(inet, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_clean_rate_log() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_check_and_record_rate_limit(inet, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_check_and_record_otp_phone_send(text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_otp_send_count_for_phone(text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_clean_rate_limit_events() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_email_exists(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_phone_exists(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_survey_latest_for_normalized_phone(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ip_submission_count(inet, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_clean_rate_log() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_check_and_record_rate_limit(inet, text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_check_and_record_otp_phone_send(text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_otp_send_count_for_phone(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_clean_rate_limit_events() TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_email_exists(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_phone_exists(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_survey_latest_for_normalized_phone(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ip_submission_count(inet, int) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_clean_rate_log() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_check_and_record_rate_limit(inet, text, int, int) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_check_and_record_otp_phone_send(text, int, int) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_otp_send_count_for_phone(text, int) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_clean_rate_limit_events() FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.app_settings_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_settings_updated ON public.app_settings;
CREATE TRIGGER trg_app_settings_updated
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.app_settings_set_updated_at();

REVOKE ALL ON FUNCTION public.app_settings_set_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_settings_set_updated_at() TO service_role;

-- SECTION: Create/09_verification_queries.sql
-- ═══════════════════════════════════════════════════════════════════════════
--  09. VERIFICATION QUERIES — confirm RLS + policies after Create_All.sql
-- ═══════════════════════════════════════════════════════════════════════════

SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles',
    'users',
    'audit_log',
    'rate_limit_log',
    'rate_limit_events',
    'otp_send_events',
    'app_settings',
    'role_permission_grants'
  )
ORDER BY tablename;

SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
