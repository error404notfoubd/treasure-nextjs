-- Human-readable summary of which fields changed (list view); full old/new remains in JSONB.
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS change_summary text;

COMMENT ON COLUMN public.audit_log.change_summary IS
  'Short description of fields changed on UPDATE (e.g. for users: Name, Phone, Bonus granted).';
