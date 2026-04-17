-- Public Facebook page URL for player-facing emails (email-verified-player) and dashboard editing.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS facebook_page_url text;

UPDATE public.app_settings
SET facebook_page_url = 'https://www.facebook.com/treasurehuntdotfun'
WHERE id = 1
  AND (facebook_page_url IS NULL OR btrim(facebook_page_url) = '');

ALTER TABLE public.app_settings
  ALTER COLUMN facebook_page_url SET DEFAULT 'https://www.facebook.com/treasurehuntdotfun',
  ALTER COLUMN facebook_page_url SET NOT NULL;

COMMENT ON COLUMN public.app_settings.facebook_page_url IS
  'Official Facebook page URL (https). Used by email-verified-player and editable under Dashboard → System.';
