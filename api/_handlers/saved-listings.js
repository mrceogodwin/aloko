import { getPool } from "../_lib/db.js";
import { authorize } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
import { rateLimit } from "../_lib/rate-limit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LIST_SQL = `
  SELECT l.id, l.title, l.category, l.kind, l.condition, l.price_kobo,
         l.city, l.state, l.status, l.published_at, s.created_at AS saved_at
  FROM public.saved_listings s
  JOIN public.listings l ON l.id = s.listing_id
  WHERE s.user_id = $1::uuid
    AND l.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 100
`;

const SAVE_SQL = `
  INSERT INTO public.saved_listings (user_id, listing_id)
  SELECT $1::uuid, l.id
  FROM public.listings l
  WHERE l.id = $2::uuid AND l.status = 'active'
  ON CONFLICT (user_id, listing_id) DO NOTHING
  RETURNING listing_id
`;

const UNSAVE_SQL = `
  DELETE FROM public.saved_listings
  WHERE user_id = $1::uuid AND listing_id = $2::uuid
  RETURNING listing_id
`;

export function createSavedListingsHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    if (!req?.auth?.user) {
      const database = getDatabase();
      const populated = await populateAuth(req, { database, bootstrapProfile: true });
      if (!populated.ok) return res.status(populated.status).json({ error: populated.error });
    }

    const limited = rateLimit(req, { scope: "saved-listings", limit: 40, windowMs: 60_000 });
    if (!limited.ok) {
      res.setHeader("Retry-After", String(limited.retryAfterSec));
      return res.status(limited.status).json({ error: limited.error });
    }

    const auth = authorize(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (!UUID.test(auth.user.id)) {
      return res.status(401).json({ error: "Authenticated account is not configured for marketplace access" });
    }

    const database = getDatabase();
    if (!database) return res.status(503).json({ error: "Saved listings are temporarily unavailable" });

    try {
      if (req.method === "GET") {
        const result = await database.query(LIST_SQL, [auth.user.id]);
        const items = (result.rows || []).map((row) => ({
          ...row,
          price_naira: row.price_kobo == null ? null : Number(row.price_kobo) / 100,
        }));
        return res.status(200).json({ items, count: items.length });
      }

      if (req.method === "POST" || req.method === "DELETE") {
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const listingId = typeof body.listing_id === "string" ? body.listing_id : "";
        if (!UUID.test(listingId)) {
          return res.status(400).json({ error: "A valid listing_id is required" });
        }
        if (req.method === "POST") {
          const result = await database.query(SAVE_SQL, [auth.user.id, listingId]);
          if (!result.rows?.length) {
            // Either already saved or listing not active — do not leak which.
            return res.status(200).json({ saved: true, message: "Listing saved" });
          }
          return res.status(201).json({ saved: true, message: "Listing saved" });
        }
        await database.query(UNSAVE_SQL, [auth.user.id, listingId]);
        return res.status(200).json({ saved: false, message: "Listing removed from saved" });
      }

      res.setHeader("Allow", "GET, POST, DELETE");
      return res.status(405).json({ error: "Method not allowed" });
    } catch {
      return res.status(500).json({ error: "Could not update saved listings" });
    }
  };
}

export default createSavedListingsHandler();
