-- Track post-verify survey progress. NOT NULL: backfill; new rows default to Phone Number until advanced by the app.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS survey_last_completed_step text;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_survey_last_completed_step_values;

UPDATE public.users SET survey_last_completed_step = 'Completed' WHERE survey_last_completed_step = 'From';

UPDATE public.users SET survey_last_completed_step = 'Completed'
WHERE survey_last_completed_step IS NULL AND heard_from IS NOT NULL AND trim(heard_from) <> '';

UPDATE public.users SET survey_last_completed_step = 'Phone Number' WHERE survey_last_completed_step IS NULL;

ALTER TABLE public.users ALTER COLUMN survey_last_completed_step SET DEFAULT 'Phone Number';

ALTER TABLE public.users
  ADD CONSTRAINT users_survey_last_completed_step_values CHECK (
    survey_last_completed_step IN ('Phone Number', 'Facebook DM', 'Completed')
  );

ALTER TABLE public.users ALTER COLUMN survey_last_completed_step SET NOT NULL;

COMMENT ON COLUMN public.users.survey_last_completed_step IS 'Last finished survey funnel step: Phone Number (form/OTP), optional Facebook DM, or Completed (heard_from saved).';
