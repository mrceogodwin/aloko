-- Mutual completion and auditable cancellation for service bookings.
BEGIN;
ALTER TABLE public.service_requests
 ADD COLUMN IF NOT EXISTS completed_by_provider_at timestamptz,
 ADD COLUMN IF NOT EXISTS completed_by_customer_at timestamptz,
 ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS cancellation_reason text;
COMMIT;
