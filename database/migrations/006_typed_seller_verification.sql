-- Typed verification identifiers are the default; file evidence remains optional and private.
BEGIN;
ALTER TABLE public.verification_applications
  ADD COLUMN IF NOT EXISTS identity_type text,
  ADD COLUMN IF NOT EXISTS identity_number text;
ALTER TABLE public.verification_applications
  ADD CONSTRAINT verification_identity_type_check
  CHECK (identity_type IS NULL OR identity_type IN ('nin', 'voters_card', 'drivers_license', 'international_passport'));
ALTER TABLE public.verification_applications
  ADD CONSTRAINT verification_identity_number_length_check
  CHECK (identity_number IS NULL OR length(trim(identity_number)) BETWEEN 4 AND 40);
COMMIT;
