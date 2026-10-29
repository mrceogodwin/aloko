/**
 * Atomically spend one listing credit for publishing a listing.
 * Returns { ok: true, balance } or { ok: false, error, status }.
 */

const SPEND_SQL = `
  WITH account AS (
    SELECT seller_id, balance
    FROM public.listing_credit_accounts
    WHERE seller_id = $1::uuid
    FOR UPDATE
  ),
  debit AS (
    UPDATE public.listing_credit_accounts a
    SET balance = a.balance - 1,
        updated_at = now()
    FROM account
    WHERE a.seller_id = account.seller_id
      AND account.balance >= 1
    RETURNING a.seller_id, a.balance
  ),
  ledger AS (
    INSERT INTO public.credit_ledger (seller_id, listing_id, delta, reason, actor_id, note)
    SELECT debit.seller_id, $2::uuid, -1, 'listing_publish', $3::uuid, 'Credit spent on listing publish'
    FROM debit
    RETURNING id
  )
  SELECT
    (SELECT balance FROM debit) AS balance,
    (SELECT id FROM ledger) AS ledger_id,
    EXISTS (SELECT 1 FROM account) AS has_account,
    COALESCE((SELECT balance FROM account), 0) AS prior_balance
`;

export async function spendListingCredit(database, { sellerId, listingId, actorId }) {
  if (!database) {
    return { ok: false, status: 503, error: "Credits are temporarily unavailable" };
  }
  try {
    const result = await database.query(SPEND_SQL, [sellerId, listingId, actorId || sellerId]);
    const row = result.rows?.[0];
    if (!row) {
      return { ok: false, status: 500, error: "Could not update listing credits" };
    }
    if (row.balance == null) {
      if (!row.has_account || Number(row.prior_balance) < 1) {
        return {
          ok: false,
          status: 402,
          error: "Seller has no listing credits. Claim introductory credits or purchase more before publish.",
        };
      }
      return { ok: false, status: 402, error: "Insufficient listing credits" };
    }
    return {
      ok: true,
      balance: Number(row.balance),
      ledgerId: row.ledger_id,
    };
  } catch {
    return { ok: false, status: 500, error: "Could not spend listing credit" };
  }
}
