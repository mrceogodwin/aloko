-- Track completion of primary account-type onboarding.
-- Existing accounts keep their current type; newly authenticated profiles must choose once.
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type_selected_at timestamptz;

UPDATE public.profiles
SET account_type_selected_at = COALESCE(created_at, now())
WHERE account_type_selected_at IS NULL;

COMMIT;
