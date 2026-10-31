import pg from "pg";
import { authorize } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
import { rateLimit } from "../_lib/rate-limit.js";
import { validateListingInput } from "../_lib/validate-listing.js";

const { Pool } = pg;
let pool;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    ssl: { rejectUnauthorized: true },
  });
  return pool;
}

const INSERT_LISTING = `
  INSERT INTO public.listings (
    seller_id, title, description, category, kind, condition, price_kobo,
    quantity, city, state, pickup_available, delivery_available, status
  )
  SELECT p.id, $2, $3, $4, $5::public.listing_kind, $6::public.item_condition,
         $7, $8, $9, $10, $11, $12, 'pending_review'::public.listing_status
  FROM public.profiles p
  WHERE p.id = $1::uuid
    AND p.is_suspended = false
    AND (($13 = 'seller' AND p.account_type IN ('individual', 'reseller'))
      OR ($13 = 'business' AND p.account_type IN ('business', 'bulk_distributor')))
    AND EXISTS (
      SELECT 1 FROM public.seller_stores s
      WHERE s.user_id = p.id
        AND s.verification_status = 'approved'::public.verification_status
        AND (($13 = 'seller' AND s.account_kind = 'individual_seller'::public.verification_subject)
          OR ($13 = 'business' AND s.account_kind = 'business_seller'::public.verification_subject))
    )
  RETURNING id, title, description, category, kind, condition, price_kobo,
            quantity, city, state, pickup_available, delivery_available, status, created_at
`;

export function createListingCreateHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (!req?.auth?.user) {
      const database = getDatabase();
      const populated = await populateAuth(req, {
        database,
        bootstrapProfile: true,
      });
      if (!populated.ok) {
        return res.status(populated.status).json({ error: populated.error });
      }
    }

    const limited = rateLimit(req, { scope: "listings-create", limit: 10, windowMs: 60_000 });
    if (!limited.ok) {
      res.setHeader("Retry-After", String(limited.retryAfterSec));
      return res.status(limited.status).json({ error: limited.error });
    }

    const auth = authorize(req, ["seller", "business"]);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const userId = auth.user.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return res.status(401).json({ error: "Authenticated account is not configured for marketplace access" });
    }

    const validated = validateListingInput(req.body);
    if (!validated.valid) {
      return res.status(400).json({ error: "Invalid listing details", fields: validated.errors });
    }

    const database = getDatabase();
    if (!database) {
      return res.status(503).json({ error: "Listing creation is temporarily unavailable" });
    }

    const value = validated.value;
    try {
      const result = await database.query(INSERT_LISTING, [
        userId, value.title, value.description, value.category, value.kind,
        value.condition, value.price_kobo, value.quantity, value.city, value.state,
        value.pickup_available, value.delivery_available, auth.user.role,
      ]);
      if (!result.rows?.length) {
        return res.status(403).json({ error: "Your profile type is not eligible to create this listing" });
      }
      return res.status(201).json({ item: result.rows[0], message: "Listing submitted for review" });
    } catch {
      return res.status(500).json({ error: "Could not create listing" });
    }
  };
}

export default createListingCreateHandler();
