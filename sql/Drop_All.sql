-- =============================================================================
--  DROP ALL — destructive teardown for objects created by Create_All.sql
--  (plus optional legacy survey/OTP objects if they still exist).
--  BACK UP FIRST. Re-apply Create_All.sql afterward. Does NOT drop public.profiles
--  or auth/profile triggers (see sql/README.md).
-- =============================================================================

-- ── Optional legacy (safe if absent) ─────────────────────────────────────────
DROP VIEW IF EXISTS public.survey_responses_redacted;
DROP TABLE IF EXISTS public.verification_codes CASCADE;
DROP TABLE IF EXISTS public.survey_responses CASCADE;

-- ── Tables with no remaining function dependencies in this bundle ───────────
DROP TABLE IF EXISTS public.role_permission_grants CASCADE;

DROP TABLE IF EXISTS public.app_settings CASCADE;
DROP FUNCTION IF EXISTS public.app_settings_set_updated_at();

-- ── Funnel users (RPCs reference public.users) ──────────────────────────────
DROP FUNCTION IF EXISTS public.fn_email_exists(text);
DROP FUNCTION IF EXISTS public.fn_phone_exists(text);
DROP FUNCTION IF EXISTS public.fn_survey_latest_for_normalized_phone(text);
DROP TABLE IF EXISTS public.users CASCADE;
DROP TYPE IF EXISTS public.registration_step CASCADE;

-- ── Rate limit log ───────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_ip_submission_count(inet, int);
DROP FUNCTION IF EXISTS public.fn_clean_rate_log();
DROP TABLE IF EXISTS public.rate_limit_log CASCADE;

-- ── Rate limit events + OTP send events ──────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_check_and_record_rate_limit(inet, text, int, int);
DROP FUNCTION IF EXISTS public.fn_clean_rate_limit_events();
DROP TABLE IF EXISTS public.rate_limit_events CASCADE;

DROP FUNCTION IF EXISTS public.fn_check_and_record_otp_phone_send(text, int, int);
DROP TABLE IF EXISTS public.otp_send_events CASCADE;

DROP FUNCTION IF EXISTS public.fn_otp_send_count_for_phone(text, int);

-- ── Profiles helper (not dropped: public.profiles) ───────────────────────────
DROP FUNCTION IF EXISTS public.get_user_role(uuid);

-- ── Audit log ───────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_audit_log();
DROP TABLE IF EXISTS public.audit_log CASCADE;
