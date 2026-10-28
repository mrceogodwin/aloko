-- Aloko operational configuration and staff authorization schema.
-- Draft only: do not apply until reviewed and paired with server-side policies.

BEGIN;

CREATE TABLE public.staff_memberships (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.account_role NOT NULL CHECK (role IN ('moderator', 'admin')),
  permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_active boolean NOT NULL DEFAULT true,
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_settings (
  setting_key text PRIMARY KEY CHECK (setting_key ~ '^[a-z][a-z0-9_.-]{1,100}$'),
  setting_value jsonb NOT NULL,
  description text NOT NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.listing_credit_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  credits integer NOT NULL CHECK (credits > 0),
  price_kobo bigint NOT NULL CHECK (price_kobo > 0),
  validity_days integer NOT NULL DEFAULT 30 CHECK (validity_days > 0),
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.promotion_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  promotion_type text NOT NULL CHECK (promotion_type IN ('featured_listing', 'store_promotion')),
  price_kobo bigint NOT NULL CHECK (price_kobo > 0),
  duration_days integer NOT NULL CHECK (duration_days > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('approve_listing', 'reject_listing', 'hide_listing', 'remove_listing', 'suspend_user', 'reinstate_user', 'resolve_report', 'adjust_credits', 'manage_promotion')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 2000),
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_actions_listing_idx ON public.moderation_actions (listing_id, created_at DESC);
CREATE INDEX moderation_actions_actor_idx ON public.moderation_actions (moderator_id, created_at DESC);

-- Suggested configurable defaults, not validated commercial prices.
INSERT INTO public.platform_settings (setting_key, setting_value, description) VALUES
  ('fees.standard_listing_kobo', '20000'::jsonb, 'Proposed standard listing fee in kobo; admin configurable.'),
  ('fees.featured_listing_kobo', '30000'::jsonb, 'Proposed featured listing fee in kobo; admin configurable.'),
  ('fees.store_promotion_kobo', '70000'::jsonb, 'Proposed store promotion fee in kobo; admin configurable.'),
  ('credits.introductory_grant', '3'::jsonb, 'Proposed introductory listing credits for new sellers; admin configurable.'),
  ('credits.default_validity_days', '30'::jsonb, 'Proposed credit validity in days; admin configurable.')
ON CONFLICT (setting_key) DO NOTHING;

COMMIT;

-- IMPORTANT:
-- * Permissions are data, not authorization by themselves. Enforce them in trusted
--   server code and database policies for every privileged operation.
-- * Never let a client write payment status, balances, credit ledger entries,
--   moderation actions, staff memberships, or platform settings directly.
-- * Add a transaction-safe credit ledger function and verified payment webhook
--   before enabling paid listing publication.
-- * Protect the last active owner/admin from removal in server-side logic.
