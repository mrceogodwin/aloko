import { getPool } from "./_lib/db.js";
import { authorize } from "./_lib/authz.js";
import { populateAuth } from "./_lib/populate-auth.js";
import { rateLimit } from "./_lib/rate-limit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTRO_GRANT = 3;

const BALANCE_SQL = `
  SELECT balance, updated_at
  FROM public.listing_credit_accounts
  WHERE seller_id = $1::uuid
`;

const LEDGER_SQL = `
  SELECT id, delta, reason, listing_id, note, created_at
  FROM public.credit_ledger
  WHERE seller_id = $1::uuid
  ORDER BY created_at DESC
  LIMIT 50
`;

/** One-time introductory grant. Idempotent via ledger reason check. */
const GRANT_SQL = `
  WITH already AS (
    SELECT 1 FROM public.credit_ledger
    WHERE seller_id = $1::uuid AND reason = 'introductory_grant'
    LIMIT 1
  ),
  upsert_account AS (
    INSERT INTO public.listing_credit_accounts (seller_id, balance, updated_at)
    SELECT $1::uuid, $2, now()
    WHERE NOT EXISTS (SELECT 1 FROM already)
    ON CONFLICT (seller_id) DO UPDATE
      SET balance = public.listing_credit_accounts.balance + EXCLUDED.balance,
          updated_at = now()
      WHERE NOT EXISTS (SELECT 1 FROM already)
    RETURNING seller_id, balance
  ),
  ledger AS (
    INSERT INTO public.credit_ledger (seller_id, delta, reason, note)
    SELECT $1::uuid, $2, 'introductory_grant', 'Welcome listing credits'
    WHERE NOT EXISTS (SELECT 1 FROM already)
      AND EXISTS (SELECT 1 FROM upsert_account)
    RETURNING id, delta, reason, created_at
  )
  SELECT
    (SELECT balance FROM public.listing_credit_accounts WHERE seller_id = $1::uuid) AS balance,
    (SELECT id FROM ledger) AS grant_id,
    EXISTS (SELECT 1 FROM already) AS already_granted
`;

export function createListingCreditsHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    if (!req?.auth?.user) {
      const database = getDatabase();
      const populated = await populateAuth(req, { database, bootstrapProfile: true });
      if (!populated.ok) return res.status(populated.status).json({ error: populated.error });
    }

    const limited = rateLimit(req, { scope: "listing-credits", limit: 20, windowMs: 60_000 });
    if (!limited.ok) {
      res.setHeader("Retry-After", String(limited.retryAfterSec));
      return res.status(limited.status).json({ error: limited.error });
    }

    const auth = authorize(req, ["seller", "business"]);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (!UUID.test(auth.user.id)) {
      return res.status(401).json({ error: "Authenticated account is not configured for marketplace access" });
    }

    const database = getDatabase();
    if (!database) return res.status(503).json({ error: "Credits are temporarily unavailable" });

    try {
      if (req.method === "GET") {
        const [balanceResult, ledgerResult] = await Promise.all([
          database.query(BALANCE_SQL, [auth.user.id]),
          database.query(LEDGER_SQL, [auth.user.id]),
        ]);
        const balance = balanceResult.rows?.[0]?.balance ?? 0;
        return res.status(200).json({
          balance,
          ledger: ledgerResult.rows || [],
        });
      }

      if (req.method === "POST") {
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const action = typeof body.action === "string" ? body.action.trim() : "";
        if (action !== "claim_introductory") {
          return res.status(400).json({ error: "action must be claim_introductory" });
        }
        const result = await database.query(GRANT_SQL, [auth.user.id, INTRO_GRANT]);
        const row = result.rows?.[0] || {};
        if (row.already_granted) {
          return res.status(200).json({
            balance: row.balance ?? 0,
            already_granted: true,
            message: "Introductory credits were already claimed",
          });
        }
        return res.status(201).json({
          balance: row.balance ?? INTRO_GRANT,
          already_granted: false,
          grant_id: row.grant_id,
          message: `Granted ${INTRO_GRANT} introductory listing credits`,
        });
      }

      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    } catch {
      return res.status(500).json({ error: "Could not load listing credits" });
    }
  };
}

export default createListingCreditsHandler();
