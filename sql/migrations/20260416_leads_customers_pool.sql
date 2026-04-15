-- Pool membership: each funnel user (public.users) is in exactly one of public.leads
-- or public.customers — never both. Sync is enforced by trigger on users.contacted / bonus_granted.
-- Bonus cannot be true unless contacted is true (CHECK on public.users).
--
-- Run after 20260415_users_bonus_granted_contacted.sql (or ensure bonus_granted + contacted exist).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bonus_granted boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS contacted boolean NOT NULL DEFAULT false;

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

COMMENT ON TABLE public.leads IS 'Funnel rows still in the Leads queue (not contacted and no bonus).';
COMMENT ON TABLE public.customers IS 'Funnel rows moved out of Leads (contacted and/or bonus granted).';

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

-- List + count for dashboard (service_role); search mirrors app OR logic.
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

-- Align membership with flags (does not modify public.users rows).
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
