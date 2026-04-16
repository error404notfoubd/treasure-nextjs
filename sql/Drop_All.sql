-- =============================================================================
--  DROP ALL — destructive teardown for objects created by sql/Create_All.sql.
--
--  DESCRIPTION
--  Removes funnel and ops tables (public.users, public.leads, public.customers,
--  favorite_games, app_settings, role_permission_grants, rate_limit_*,
--  otp_send_events, audit_log), the registration_step type, and standalone
--  RPCs/trigger functions tied to those objects — so Create_All.sql can be
--  re-run on a clean slate.
--
--  Does NOT drop: public.profiles, auth/profile triggers (handle_new_user,
--  handle_updated_at, handle_profile_deleted), or public.get_user_role(uuid).
--
--  BACK UP FIRST. Re-run sql/Create_All.sql afterward to recreate dropped objects.
-- =============================================================================

-- ── Optional (safe if absent) ───────────────────────────────────────────────
DROP TABLE IF EXISTS public.verification_codes CASCADE;

-- ── Tables (CASCADE clears triggers bound to these tables) ─────────────────
DROP TABLE IF EXISTS public.role_permission_grants CASCADE;
DROP TABLE IF EXISTS public.app_settings CASCADE;

-- Pool membership (FK → public.users); drop before users.
DROP TABLE IF EXISTS public.leads CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;

DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.favorite_games CASCADE;
DROP TYPE IF EXISTS public.registration_step CASCADE;

DROP TABLE IF EXISTS public.rate_limit_log CASCADE;
DROP TABLE IF EXISTS public.rate_limit_events CASCADE;
DROP TABLE IF EXISTS public.otp_send_events CASCADE;

DROP TABLE IF EXISTS public.audit_log CASCADE;

-- ── Standalone functions (not used by profiles; tables above already dropped) ─
DROP FUNCTION IF EXISTS public.app_settings_set_updated_at();
DROP FUNCTION IF EXISTS public.users_lead_flags_false_on_insert();
DROP FUNCTION IF EXISTS public.users_lead_flags_enforce_dependencies();
DROP FUNCTION IF EXISTS public.sync_users_pool_membership();
DROP FUNCTION IF EXISTS public.fn_pool_user_ids_page(text, int, int, boolean, text, text, text);
DROP FUNCTION IF EXISTS public.fn_pool_user_ids_count(text, boolean, text, text, text);
DROP FUNCTION IF EXISTS public.fn_email_exists(text);
DROP FUNCTION IF EXISTS public.fn_phone_exists(text);
DROP FUNCTION IF EXISTS public.fn_survey_latest_for_normalized_phone(text);
DROP FUNCTION IF EXISTS public.fn_ip_submission_count(inet, int);
DROP FUNCTION IF EXISTS public.fn_clean_rate_log();
DROP FUNCTION IF EXISTS public.fn_check_and_record_rate_limit(inet, text, int, int);
DROP FUNCTION IF EXISTS public.fn_check_and_record_otp_phone_send(text, int, int);
DROP FUNCTION IF EXISTS public.fn_clean_rate_limit_events();
DROP FUNCTION IF EXISTS public.fn_otp_send_count_for_phone(text, int);
DROP FUNCTION IF EXISTS public.fn_audit_log();
