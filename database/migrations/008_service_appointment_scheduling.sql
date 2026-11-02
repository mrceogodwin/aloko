-- Aloko service appointment proposals and customer confirmation.
-- Development migration: do not apply to production without explicit approval.
BEGIN;
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS proposed_start timestamptz,
  ADD COLUMN IF NOT EXISTS proposed_end timestamptz;
ALTER TABLE public.service_requests
  ADD CONSTRAINT service_requests_proposed_window_check
  CHECK (
    (proposed_start IS NULL AND proposed_end IS NULL)
    OR (proposed_start IS NOT NULL AND proposed_end IS NOT NULL AND proposed_end > proposed_start)
  );
CREATE INDEX IF NOT EXISTS service_requests_scheduled_start_idx
  ON public.service_requests (proposed_start)
  WHERE status = 'scheduled';
COMMIT;
