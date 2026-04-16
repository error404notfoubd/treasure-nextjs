-- BEFORE trigger: contacted false clears has_replied and bonus; has_replied false clears bonus.
-- Run after sql/migrations/20260418_users_has_replied_pool.sql.

CREATE OR REPLACE FUNCTION public.users_lead_flags_enforce_dependencies()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE(NEW.contacted, false) THEN
    NEW.has_replied := false;
    NEW.bonus_granted := false;
  ELSIF NOT COALESCE(NEW.has_replied, false) THEN
    NEW.bonus_granted := false;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.users_lead_flags_enforce_dependencies() IS
  'BEFORE INSERT/UPDATE on public.users: if contacted is false then has_replied and bonus_granted are false; if has_replied is false then bonus_granted is false.';

DROP TRIGGER IF EXISTS trg_users_lead_flags_enforce_dependencies ON public.users;
CREATE TRIGGER trg_users_lead_flags_enforce_dependencies
  BEFORE INSERT OR UPDATE OF contacted, has_replied, bonus_granted ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_lead_flags_enforce_dependencies();
