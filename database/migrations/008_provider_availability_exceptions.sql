-- Provider date exceptions (days off and exceptional working windows).
BEGIN;
CREATE TABLE public.service_provider_availability_exceptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider_id uuid NOT NULL REFERENCES public.service_provider_profiles(provider_id) ON DELETE CASCADE,
 exception_date date NOT NULL,
 is_available boolean NOT NULL DEFAULT false,
 starts_at time,
 ends_at time,
 note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((is_available=false AND starts_at IS NULL AND ends_at IS NULL) OR
        (is_available=true AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at>starts_at)),
 UNIQUE(provider_id,exception_date)
);
CREATE INDEX service_provider_availability_exception_lookup_idx
 ON public.service_provider_availability_exceptions(provider_id,exception_date);
COMMIT;
