import pg from "pg";
import { authorize } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UPDATE_LISTING = `
  UPDATE public.listings l
  SET title = $3, description = $4, category = $5,
      kind = $6::public.listing_kind, condition = $7::public.item_condition,
      price_kobo = $8, quantity = $9, city = $10, state = $11,
      pickup_available = $12, delivery_available = $13,
      status = 'pending_review'::public.listing_status,
      moderation_note = NULL, published_at = NULL, updated_at = now()
  WHERE l.id = $1::uuid AND l.seller_id = $2::uuid
    AND l.status IN ('draft', 'pending_review', 'active', 'rejected', 'paused')
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = l.seller_id AND p.is_suspended = false
        AND (($14 = 'seller' AND p.account_type IN ('individual', 'reseller'))
          OR ($14 = 'business' AND p.account_type IN ('business', 'bulk_distributor')))
    )
  RETURNING l.id, l.title, l.description, l.category, l.kind, l.condition,
            l.price_kobo, l.quantity, l.city, l.state, l.pickup_available,
            l.delivery_available, l.status, l.updated_at
`;

export function createListingUpdateHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "PATCH" && req.method !== "PUT") {
      res.setHeader("Allow", "PATCH, PUT");
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

    const auth = authorize(req, ["seller", "business"]);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (!UUID.test(auth.user.id)) {
      return res.status(401).json({ error: "Authenticated account is not configured for marketplace access" });
    }

    const rawId = req.query?.id;
    const listingId = typeof rawId === "string" ? rawId : "";
    if (!UUID.test(listingId)) {
      return res.status(400).json({ error: "A valid listing ID is required" });
    }

    const validated = validateListingInput(req.body);
    if (!validated.valid) {
      return res.status(400).json({ error: "Invalid listing details", fields: validated.errors });
    }

    const database = getDatabase();
    if (!database) return res.status(503).json({ error: "Listing updates are temporarily unavailable" });

    const v = validated.value;
    try {
      const result = await database.query(UPDATE_LISTING, [
        listingId, auth.user.id, v.title, v.description, v.category, v.kind,
        v.condition, v.price_kobo, v.quantity, v.city, v.state,
        v.pickup_available, v.delivery_available, auth.user.role,
      ]);
      if (!result.rows?.length) {
        // Do not disclose whether another user's listing exists.
        return res.status(404).json({ error: "Listing not found or unavailable for editing" });
      }
      return res.status(200).json({ item: result.rows[0], message: "Listing updated and submitted for review" });
    } catch {
      return res.status(500).json({ error: "Could not update listing" });
    }
  };
}

export default createListingUpdateHandler();
