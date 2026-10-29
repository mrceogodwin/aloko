import { getPool } from "./_lib/db.js";
import { authorize } from "./_lib/authz.js";
import { populateAuth } from "./_lib/populate-auth.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MY_LISTINGS_SQL = `
  SELECT
    l.id, l.title, l.description, l.category, l.kind, l.condition,
    l.price_kobo, l.quantity, l.city, l.state,
    l.pickup_available, l.delivery_available, l.status,
    l.moderation_note, l.published_at, l.created_at, l.updated_at
  FROM public.listings l
  WHERE l.seller_id = $1::uuid
  ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC
  LIMIT 100
`;

export function createMyListingsHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
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
      return res.status(401).json({
        error: "Authenticated account is not configured for marketplace access",
      });
    }

    const database = getDatabase();
    if (!database) {
      return res.status(503).json({ error: "Listings are temporarily unavailable" });
    }

    try {
      const result = await database.query(MY_LISTINGS_SQL, [auth.user.id]);
      const items = (result.rows || []).map((row) => ({
        ...row,
        price_naira: row.price_kobo === null ? null : Number(row.price_kobo) / 100,
      }));
      return res.status(200).json({ items, count: items.length });
    } catch {
      return res.status(500).json({ error: "Could not load your listings" });
    }
  };
}

export default createMyListingsHandler();
