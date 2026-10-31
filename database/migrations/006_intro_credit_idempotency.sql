-- Guarantee one introductory listing-credit grant per seller at the database level.
-- Safe on the development branch; existing duplicate grants must be reconciled before applying.
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_one_intro_grant_per_seller
  ON public.credit_ledger (seller_id)
  WHERE reason = 'introductory_grant';
