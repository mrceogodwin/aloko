-- Prevent duplicate introductory credit grants for the same seller.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_one_intro_grant_per_seller
  ON public.credit_ledger (seller_id)
  WHERE reason = 'introductory_grant';
COMMIT;
