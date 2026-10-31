-- Aloko service provider marketplace: provider applications and approved public profiles.
-- Draft only. Do not apply to the production database without review.
BEGIN;

CREATE TABLE public.service_provider_profiles (
  provider_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 100),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  provider_kind text NOT NULL DEFAULT 'individual' CHECK (provider_kind IN ('individual','business')),
  business_name text,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 30 AND 2000),
  service_types text[] NOT NULL CHECK (
    cardinality(service_types) BETWEEN 1 AND 3
    AND service_types <@ ARRAY['decluttering','organising','bulk_removal']::text[]
  ),
  city text NOT NULL CHECK (length(trim(city)) BETWEEN 2 AND 100),
  state text NOT NULL CHECK (length(trim(state)) BETWEEN 2 AND 100),
  service_areas text[] NOT NULL DEFAULT ARRAY[]::text[],
  years_experience integer CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 60),
  contact_phone text,
  contact_email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paused')),
  is_accepting_requests boolean NOT NULL DEFAULT true,
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (provider_kind = 'individual' AND business_name IS NULL)
    OR (provider_kind = 'business' AND business_name IS NOT NULL AND length(trim(business_name)) BETWEEN 2 AND 160)
  )
);

CREATE INDEX service_provider_directory_idx
  ON public.service_provider_profiles (state, city, display_name)
  WHERE status = 'approved' AND is_accepting_requests = true;

CREATE INDEX service_provider_review_queue_idx
  ON public.service_provider_profiles (status, created_at)
  WHERE status = 'pending';

CREATE INDEX service_requests_provider_inbox_idx
  ON public.service_requests (provider_id, status, created_at DESC)
  WHERE provider_id IS NOT NULL;

COMMIT;
