-- Survey attribution: single text column (preset label or free-text for "Other").

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS heard_from text;

COMMENT ON COLUMN public.users.heard_from IS 'How the respondent heard about us (ads, after phone verify): preset label or custom text.';
