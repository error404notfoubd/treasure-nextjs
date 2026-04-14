-- =============================================================================
--  CREATE ALL TABLES — run BEFORE Create_All_functions.sql on a fresh database.
--  Schema baseline, tables, types, indexes, rules, RLS policies, table grants.
--  Does not create functions, triggers, or verification SELECTs.
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


-- SECTION: Create/04_audit_log.sql
-- ═══════════════════════════════════════════════════════════════════════════
--  04. AUDIT LOG — append-only via rules; row_id as text
--  Depends on: 00_schema_baseline.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.audit_log (
  id           bigserial    PRIMARY KEY,
  table_name   text         NOT NULL,
  operation    text         NOT NULL,
  row_id       text,
  old_data     jsonb,
  new_data     jsonb,
  performed_at timestamptz  NOT NULL DEFAULT now(),
  performed_by text         NOT NULL DEFAULT current_user
);

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


-- SECTION: Create/09b_favorite_games.sql
-- ═══════════════════════════════════════════════════════════════════════════
--  Survey catalog: favorite third-party / sweepstakes-style games (dropdown).
--  Referenced by public.users.favorite_game_id. Run before Create/10_users.sql.
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
--  Run before 08_helper_functions.sql (RPCs reference this table).
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
  utm_source          text,
  utm_campaign        text,
  utm_medium          text,
  game_score          integer NOT NULL DEFAULT 0,
  searches_count      integer NOT NULL DEFAULT 0,
  registration_step   public.registration_step NOT NULL DEFAULT 'submitted',
  consent_marketing   boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  frequency           text,
  favorite_game_id    uuid REFERENCES public.favorite_games (id) ON DELETE SET NULL,
  favorite_game       text,
  is_flagged          boolean NOT NULL DEFAULT false,
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
  /** Milliseconds; bigint so values up to 30 days (2_592_000_000) fit (exceeds int4 max). */
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
