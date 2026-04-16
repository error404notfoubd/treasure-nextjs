-- Dashboard profiles: opt-in for verified-lead notification emails (notify-verified-lead edge function).
-- Safe to re-run: ADD IF NOT EXISTS; UPDATE aligns by role.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS receive_verified_lead_notifications boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.receive_verified_lead_notifications IS
  'When true, this dashboard profile receives email when a funnel user completes phone verification (notify-verified-lead).';

UPDATE public.profiles
SET receive_verified_lead_notifications = true
WHERE role IN ('owner', 'admin', 'editor');

UPDATE public.profiles
SET receive_verified_lead_notifications = false
WHERE role = 'viewer';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status, receive_verified_lead_notifications)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'viewer',
    'pending',
    false
  );
  RETURN new;
END;
$$;
