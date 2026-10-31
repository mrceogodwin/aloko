-- Weekly recurring provider availability. All times are local to the provider's IANA timezone.
-- Development only; production application requires explicit approval.
BEGIN;
CREATE TABLE public.service_provider_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.service_provider_profiles(provider_id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  timezone text NOT NULL DEFAULT 'Africa/Lagos' CHECK (length(timezone) BETWEEN 3 AND 80),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (provider_id,weekday,starts_at,ends_at)
);
CREATE INDEX service_provider_availability_lookup_idx
  ON public.service_provider_availability (provider_id,weekday,starts_at)
  WHERE is_active = true;
COMMIT;
