-- Run in Supabase SQL Editor if users exist in Authentication but have no row in public.profiles
-- (e.g. on_auth_user_created trigger was missing when they signed up). Then re-run Create/01_profiles.sql
-- trigger section if the trigger still does not exist.

INSERT INTO public.profiles (id, email, full_name, role, status)
SELECT
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  coalesce(u.raw_user_meta_data->>'role', 'viewer'),
  'pending'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
