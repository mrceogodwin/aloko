-- Aloko Phase 1: buyer/seller onboarding, verification, relationships and transaction identity.
-- Draft migration: commit to the development branch only. Review and test before applying.
BEGIN;

CREATE TYPE public.verification_status AS ENUM ('not_submitted', 'pending', 'approved', 'rejected', 'needs_information');
CREATE TYPE public.verification_subject AS ENUM ('individual_seller', 'business_seller');

-- Buyers are free to register. Preferences are optional and never gate marketplace access.
CREATE TABLE public.buyer_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  preferred_conditions public.item_condition[] NOT NULL DEFAULT ARRAY[]::public.item_condition[],
  preferred_brands text[] NOT NULL DEFAULT ARRAY[]::text[],
  budget_min_kobo bigint CHECK (budget_min_kobo IS NULL OR budget_min_kobo >= 0),
  budget_max_kobo bigint CHECK (budget_max_kobo IS NULL OR budget_max_kobo >= 0),
  location_label text,
  city text,
  state text,
  country_code char(2) NOT NULL DEFAULT 'NG',
  -- Approximate marketplace area only. Do not store a buyer's precise home pin.
  latitude numeric(9,6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  search_radius_km integer NOT NULL DEFAULT 25 CHECK (search_radius_km BETWEEN 1 AND 250),
  fulfilment_preferences text[] NOT NULL DEFAULT ARRAY['pickup','delivery']::text[],
  onboarding_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (budget_min_kobo IS NULL OR budget_max_kobo IS NULL OR budget_max_kobo >= budget_min_kobo),
  CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE TABLE public.seller_stores (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  store_slug text NOT NULL UNIQUE CHECK (store_slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  account_kind public.verification_subject NOT NULL DEFAULT 'individual_seller',
  store_name text NOT NULL CHECK (length(trim(store_name)) BETWEEN 2 AND 100),
  description text CHECK (description IS NULL OR length(description) <= 2000),
  logo_url text,
  business_name text,
  cac_registration_number text,
  category text,
  city text,
  state text,
  service_areas text[] NOT NULL DEFAULT ARRAY[]::text[],
  pickup_available boolean NOT NULL DEFAULT true,
  delivery_available boolean NOT NULL DEFAULT false,
  verification_status public.verification_status NOT NULL DEFAULT 'not_submitted',
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (account_kind = 'individual_seller' AND cac_registration_number IS NULL)
    OR account_kind = 'business_seller'
  )
);
CREATE INDEX seller_stores_public_idx ON public.seller_stores (state, city, store_name) WHERE is_public = true;

CREATE TABLE public.saved_sellers (
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (buyer_id, seller_id),
  CHECK (buyer_id <> seller_id)
);
CREATE INDEX saved_sellers_seller_idx ON public.saved_sellers (seller_id, created_at DESC);

CREATE TABLE public.verification_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  subject_type public.verification_subject NOT NULL,
  legal_name text NOT NULL CHECK (length(trim(legal_name)) BETWEEN 2 AND 160),
  business_name text,
  cac_registration_number text,
  contact_email text,
  contact_phone text,
  identity_document_key text,
  business_document_keys text[] NOT NULL DEFAULT ARRAY[]::text[],
  selfie_document_key text,
  status public.verification_status NOT NULL DEFAULT 'pending',
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewer_note text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (subject_type = 'individual_seller' AND business_name IS NULL AND cac_registration_number IS NULL)
    OR subject_type = 'business_seller'
  )
);
CREATE INDEX verification_applicant_idx ON public.verification_applications (applicant_id, submitted_at DESC);
CREATE INDEX verification_review_queue_idx ON public.verification_applications (status, submitted_at ASC);

-- Stable public Product ID belongs to a listing. Transaction IDs identify each sale separately.
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS product_code text;
UPDATE public.listings
SET product_code = 'ALK-' || upper(substr(replace(id::text, '-', ''), 1, 12))
WHERE product_code IS NULL;
ALTER TABLE public.listings
  ALTER COLUMN product_code SET DEFAULT ('ALK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)));
ALTER TABLE public.listings
  ALTER COLUMN product_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS listings_product_code_uidx ON public.listings (product_code);

CREATE TABLE public.marketplace_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_code text NOT NULL UNIQUE DEFAULT ('ALKT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 14))),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE RESTRICT,
  product_code_snapshot text NOT NULL,
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  agreed_amount_kobo bigint CHECK (agreed_amount_kobo IS NULL OR agreed_amount_kobo >= 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  status text NOT NULL DEFAULT 'seller_reported' CHECK (status IN ('seller_reported','buyer_confirmed','disputed','cancelled','completed')),
  seller_reported_at timestamptz NOT NULL DEFAULT now(),
  buyer_confirmed_at timestamptz,
  completed_at timestamptz,
  dispute_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (buyer_id <> seller_id)
);
CREATE INDEX marketplace_transactions_listing_idx ON public.marketplace_transactions (listing_id, created_at DESC);
CREATE INDEX marketplace_transactions_buyer_idx ON public.marketplace_transactions (buyer_id, created_at DESC);
CREATE INDEX marketplace_transactions_seller_idx ON public.marketplace_transactions (seller_id, created_at DESC);

-- Append-only event history for public sold state and internal traceability.
CREATE TABLE public.listing_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('created','published','paused','seller_reported_sale','buyer_confirmed_sale','sale_disputed','relisted','removed')),
  transaction_id uuid REFERENCES public.marketplace_transactions(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_events_listing_idx ON public.listing_events (listing_id, created_at DESC);

-- Preserve a product-specific thread while allowing it to reference a transaction when one exists.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES public.marketplace_transactions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS conversations_transaction_idx ON public.conversations (transaction_id) WHERE transaction_id IS NOT NULL;

-- Authorization must be enforced by trusted API code and database policies.
-- Verification documents must be private objects; never expose document keys publicly.
-- Do not let clients write verification decisions, transaction status, or listing events.
COMMIT;
