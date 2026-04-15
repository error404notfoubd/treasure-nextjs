-- Migration: lead tracking flags on public.users (funnel signups)
--
-- Safe for existing databases: only ADD COLUMN (with defaults), function + trigger.
-- Does not drop tables, truncate, or rewrite rows. Existing rows get false for both flags.
--
-- Apply in Supabase SQL Editor, or: supabase db push / psql -f ...
--

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS bonus_granted boolean NOT NULL DEFAULT false;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS contacted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.bonus_granted IS
  'Whether staff has recorded a bonus for this lead; forced false on new row insert.';

COMMENT ON COLUMN public.users.contacted IS
  'Whether staff has contacted this lead; forced false on new row insert.';

-- Ensures flags are false on INSERT even if a client sends other values.
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

COMMENT ON FUNCTION public.users_lead_flags_false_on_insert() IS
  'Trigger: sets bonus_granted and contacted to false for every new public.users row.';

DROP TRIGGER IF EXISTS trg_users_lead_flags_on_insert ON public.users;

CREATE TRIGGER trg_users_lead_flags_on_insert
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_lead_flags_false_on_insert();
