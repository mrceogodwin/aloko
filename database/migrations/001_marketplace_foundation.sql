-- Aloko PostgreSQL foundation (not applied automatically).
-- Provider-neutral schema. Connect profile IDs to the chosen auth provider before launch.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.account_role AS ENUM ('buyer', 'seller', 'moderator', 'admin');
CREATE TYPE public.listing_status AS ENUM ('draft', 'pending_review', 'active', 'rejected', 'paused', 'sold', 'expired', 'removed');
CREATE TYPE public.listing_kind AS ENUM ('sale', 'giveaway', 'bulk');
CREATE TYPE public.item_condition AS ENUM ('new', 'like_new', 'good', 'fair', 'for_parts');
CREATE TYPE public.payment_status AS ENUM ('pending', 'verified', 'failed', 'refunded', 'cancelled');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, -- Must match the user's ID from the selected authentication provider.
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 80),
  phone text,
  account_type text NOT NULL DEFAULT 'individual'
    CHECK (account_type IN ('individual', 'reseller', 'business', 'bulk_distributor', 'decluttering_provider')),
  city text,
  state text,
  avatar_url text,
  is_suspended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 4 AND 120),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 5000),
  category text NOT NULL CHECK (length(trim(category)) BETWEEN 2 AND 80),
  kind public.listing_kind NOT NULL DEFAULT 'sale',
  condition public.item_condition,
  price_kobo bigint CHECK (price_kobo IS NULL OR price_kobo >= 0),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  city text NOT NULL,
  state text NOT NULL,
  pickup_available boolean NOT NULL DEFAULT true,
  delivery_available boolean NOT NULL DEFAULT false,
  status public.listing_status NOT NULL DEFAULT 'draft',
  moderation_note text,
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'giveaway' AND (price_kobo IS NULL OR price_kobo = 0)) OR kind <> 'giveaway')
);
CREATE INDEX listings_discovery_idx ON public.listings (status, state, city, created_at DESC);
CREATE INDEX listings_seller_idx ON public.listings (seller_id, status, created_at DESC);
CREATE INDEX listings_category_idx ON public.listings (category, status);
-- Public discovery should prioritize approved, currently visible inventory.
CREATE INDEX listings_active_recent_idx ON public.listings (published_at DESC, created_at DESC)
  WHERE status = 'active';
CREATE INDEX listings_active_price_idx ON public.listings (price_kobo ASC NULLS FIRST, created_at DESC)
  WHERE status = 'active';
CREATE INDEX listings_search_idx ON public.listings USING GIN
  (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '')));
CREATE INDEX listing_images_order_idx ON public.listing_images (listing_id, sort_order, created_at);

CREATE TABLE public.listing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  alt_text text,
  sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, storage_key)
);

CREATE TABLE public.saved_listings (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, buyer_id, seller_id),
  CHECK (buyer_id <> seller_id)
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 4000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON public.messages (conversation_id, created_at);

CREATE TABLE public.listing_credit_accounts (
  seller_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('paystack', 'flutterwave', 'manual')),
  provider_reference text UNIQUE,
  purpose text NOT NULL CHECK (purpose IN ('listing_credits', 'featured_listing', 'store_promotion')),
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  status public.payment_status NOT NULL DEFAULT 'pending',
  verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_payments_user_idx ON public.platform_payments (user_id, created_at DESC);

CREATE TABLE public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES public.platform_payments(id) ON DELETE RESTRICT,
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  delta integer NOT NULL CHECK (delta <> 0),
  reason text NOT NULL CHECK (reason IN ('introductory_grant', 'verified_purchase', 'listing_publish', 'admin_adjustment', 'refund_reversal')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credit_ledger_seller_idx ON public.credit_ledger (seller_id, created_at DESC);

CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.listings(id) ON DELETE CASCADE,
  store_owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES public.platform_payments(id) ON DELETE RESTRICT,
  starts_at timestamptz,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'active', 'ended', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > COALESCE(starts_at, created_at))
);

CREATE TABLE public.listing_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  reported_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 100),
  details text CHECK (details IS NULL OR length(details) <= 3000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON public.audit_logs (created_at DESC);
CREATE INDEX audit_logs_actor_idx ON public.audit_logs (actor_id, created_at DESC);

CREATE TABLE public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  provider_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  service_type text NOT NULL DEFAULT 'decluttering' CHECK (service_type IN ('decluttering', 'organising', 'bulk_removal')),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 3000),
  city text NOT NULL,
  state text NOT NULL,
  preferred_date date,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'quoted', 'accepted', 'scheduled', 'completed', 'cancelled')),
  quoted_amount_kobo bigint CHECK (quoted_amount_kobo IS NULL OR quoted_amount_kobo >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (customer_id <> provider_id)
);

-- Security note: configure row-level security or equivalent server authorization before exposing
-- any table through an API. Payment verification, credit ledger writes,
-- moderation, suspension, and audit logging must be server-controlled.
COMMIT;
