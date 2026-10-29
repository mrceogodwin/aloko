import { getPool } from "./_lib/db.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DETAIL_SQL = `
  SELECT
    l.id, l.title, l.description, l.category, l.kind, l.condition,
    l.price_kobo, l.quantity, l.city, l.state,
    l.pickup_available, l.delivery_available, l.status,
    l.published_at, l.created_at,
    p.display_name AS seller_display_name,
    p.account_type AS seller_account_type
  FROM public.listings l
  JOIN public.profiles p ON p.id = l.seller_id
  WHERE l.id = $1::uuid
    AND l.status = 'active'
  LIMIT 1
`;

export function createListingsDetailHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const rawId = req.query?.id;
    const listingId = typeof rawId === "string" ? rawId : "";
    if (!UUID.test(listingId)) {
      return res.status(400).json({ error: "A valid listing ID is required" });
    }

    const database = getDatabase();
    if (!database) {
      return res.status(503).json({ error: "Marketplace listings are temporarily unavailable" });
    }

    try {
      const result = await database.query(DETAIL_SQL, [listingId]);
      const row = result.rows?.[0];
      if (!row) {
        return res.status(404).json({ error: "Listing not found" });
      }
      res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
      return res.status(200).json({
        item: {
          ...row,
          price_naira: row.price_kobo === null ? null : Number(row.price_kobo) / 100,
        },
      });
    } catch {
      return res.status(500).json({ error: "Could not load listing" });
    }
  };
}

export default createListingsDetailHandler();
