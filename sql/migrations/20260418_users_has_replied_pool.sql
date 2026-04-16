-- has_replied + stricter bonus rules + leads/customers pool driven by has_replied only.
-- Run after sql/migrations/20260416_leads_customers_pool.sql (and 20260415 if bonus/contacted columns are new).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS has_replied boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.has_replied IS
  'Whether staff has recorded that the lead replied; only true after contacted.';

UPDATE public.users u
SET has_replied = true
WHERE u.bonus_granted = true
  AND u.contacted = true
  AND u.has_replied = false;

CREATE OR REPLACE FUNCTION public.users_lead_flags_false_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.bonus_granted := false;
  NEW.contacted := false;
  NEW.has_replied := false;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.users_lead_flags_false_on_insert() IS
  'Trigger: sets bonus_granted, contacted, and has_replied to false for every new public.users row.';

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_bonus_requires_contacted;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_bonus_requires_contacted_and_replied;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_has_replied_requires_contacted;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_has_replied_requires_contacted'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_has_replied_requires_contacted
      CHECK (NOT has_replied OR contacted);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_bonus_requires_contacted_and_replied'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_bonus_requires_contacted_and_replied
      CHECK (NOT bonus_granted OR (contacted AND has_replied));
  END IF;
END $$;

COMMENT ON TABLE public.leads IS
  'Funnel rows in the Leads queue (has_replied false); mutually exclusive with public.customers.';

COMMENT ON TABLE public.customers IS
  'Funnel rows out of Leads (has_replied true); mutually exclusive with public.leads.';

CREATE OR REPLACE FUNCTION public.sync_users_pool_membership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  in_leads boolean;
BEGIN
  in_leads := NOT COALESCE(NEW.has_replied, false);

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
  'Keeps public.leads vs public.customers from users.has_replied only (after contacted-dependent coercion).';

DROP TRIGGER IF EXISTS trg_users_sync_pool_membership ON public.users;
CREATE TRIGGER trg_users_sync_pool_membership
  AFTER INSERT OR UPDATE OF contacted, has_replied ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_users_pool_membership();

DELETE FROM public.customers c
USING public.users u
WHERE c.user_id = u.user_id
  AND (NOT COALESCE(u.has_replied, false));

DELETE FROM public.leads l
USING public.users u
WHERE l.user_id = u.user_id
  AND COALESCE(u.has_replied, false);

INSERT INTO public.leads (user_id)
SELECT u.user_id
FROM public.users u
WHERE NOT COALESCE(u.has_replied, false)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.customers (user_id)
SELECT u.user_id
FROM public.users u
WHERE COALESCE(u.has_replied, false)
ON CONFLICT (user_id) DO NOTHING;
