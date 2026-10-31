import { getPool } from "../_lib/db.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STORE_SQL = `
  SELECT id, display_name, account_type, city, state, avatar_url, created_at
  FROM public.profiles
  WHERE id = $1::uuid AND is_suspended = false
  LIMIT 1
`;

const STORE_LISTINGS_SQL = `
  SELECT l.id, l.seller_id, l.title, l.description, l.category, l.kind,
         l.condition, l.price_kobo, l.quantity, l.city, l.state,
         l.pickup_available, l.delivery_available, l.published_at, l.created_at,
         p.display_name AS seller_display_name,
         p.avatar_url AS seller_avatar_url,
         p.account_type AS seller_account_type
  FROM public.listings l
  JOIN public.profiles p ON p.id = l.seller_id
  WHERE l.seller_id = $1::uuid
    AND l.status = 'active'
    AND p.is_suspended = false
  ORDER BY l.published_at DESC NULLS LAST, l.created_at DESC
  LIMIT 48
`;

export function createSellerStoreHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const sellerId = typeof req.query?.seller_id === "string" ? req.query.seller_id : "";
    if (!UUID.test(sellerId)) {
      return res.status(400).json({ error: "A valid seller_id is required" });
    }

    const database = getDatabase();
    if (!database) {
      return res.status(503).json({ error: "Seller storefronts are temporarily unavailable" });
    }

    try {
      const profileResult = await database.query(STORE_SQL, [sellerId]);
      const profile = profileResult.rows?.[0];
      if (!profile) return res.status(404).json({ error: "Seller storefront not found" });

      const listingResult = await database.query(STORE_LISTINGS_SQL, [sellerId]);
      const items = (listingResult.rows || []).map((row) => ({
        ...row,
        price_naira: row.price_kobo == null ? null : Number(row.price_kobo) / 100,
      }));

      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
      return res.status(200).json({
        store: {
          id: profile.id,
          display_name: profile.display_name,
          account_type: profile.account_type,
          city: profile.city,
          state: profile.state,
          avatar_url: profile.avatar_url,
          created_at: profile.created_at,
        },
        items,
        count: items.length,
      });
    } catch {
      res.setHeader("Cache-Control", "no-store");
      return res.status(500).json({ error: "Could not load seller storefront" });
    }
  };
}

export default createSellerStoreHandler();
