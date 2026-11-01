-- Add an explicit buyer account type for the signup onboarding flow.
-- This migration is intentionally NOT applied automatically.
BEGIN;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_account_type_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_type_check
  CHECK (account_type IN (
    'buyer',
    'individual',
    'reseller',
    'business',
    'bulk_distributor',
    'decluttering_provider'
  ));

ALTER TABLE public.profiles
  ALTER COLUMN account_type SET DEFAULT 'buyer';

COMMIT;
