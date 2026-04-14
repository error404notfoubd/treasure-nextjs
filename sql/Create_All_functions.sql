-- =============================================================================
--  CREATE ALL FUNCTIONS — run AFTER Create_All_tables.sql
--  Profile/auth trigger functions + triggers, audit helper, RPCs, app_settings
--  trigger function + trigger, then optional verification SELECTs.
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
--  09. VERIFICATION QUERIES — confirm RLS + policies after bundled create scripts
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
