import { getPool } from "../_lib/db.js";
import { authorize } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
import { rateLimit } from "../_lib/rate-limit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createSavedSellersHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    const database = getDatabase();
    if (!req?.auth?.user) {
      const populated = await populateAuth(req, { database, bootstrapProfile: true });
      if (!populated.ok) return res.status(populated.status).json({ error: populated.error });
    }
    const auth = authorize(req, ["buyer"]);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (!UUID.test(auth.user.id)) return res.status(401).json({ error: "Marketplace account is not configured" });
    const limited = rateLimit(req, { scope: "saved-sellers", limit: 30, windowMs: 60000 });
    if (!limited.ok) {
      res.setHeader("Retry-After", String(limited.retryAfterSec));
      return res.status(limited.status).json({ error: limited.error });
    }
    if (!database) return res.status(503).json({ error: "Seller follows are temporarily unavailable" });
    try {
      if (req.method === "GET") {
        const result = await database.query(
          `SELECT s.seller_id, s.created_at AS followed_at, p.display_name,
                  p.avatar_url, p.city, p.state, p.account_type
           FROM public.saved_sellers s
           JOIN public.profiles p ON p.id = s.seller_id
           WHERE s.buyer_id = $1::uuid AND p.is_suspended = false
           ORDER BY s.created_at DESC LIMIT 100`,
          [auth.user.id],
        );
        return res.status(200).json({ items: result.rows || [], count: result.rows?.length || 0 });
      }
      if (req.method !== "POST" && req.method !== "DELETE") {
        res.setHeader("Allow", "GET, POST, DELETE");
        return res.status(405).json({ error: "Method not allowed" });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const sellerId = typeof body.seller_id === "string" ? body.seller_id : "";
      if (!UUID.test(sellerId) || sellerId === auth.user.id) {
        return res.status(400).json({ error: "A valid seller_id is required" });
      }
      if (req.method === "POST") {
        const result = await database.query(
          `INSERT INTO public.saved_sellers (buyer_id, seller_id)
           SELECT $1::uuid, p.id FROM public.profiles p
           WHERE p.id = $2::uuid AND p.is_suspended = false
             AND p.account_type IN ('individual', 'reseller', 'business', 'bulk_distributor')
           ON CONFLICT (buyer_id, seller_id) DO NOTHING
           RETURNING seller_id`,
          [auth.user.id, sellerId],
        );
        if (!result.rows?.length) {
          const exists = await database.query(
            "SELECT id FROM public.profiles WHERE id = $1::uuid AND is_suspended = false
              AND account_type IN ('individual', 'reseller', 'business', 'bulk_distributor')",
            [sellerId],
          );
          if (!exists.rows?.length) return res.status(404).json({ error: "Seller not found" });
        }
        return res.status(200).json({ following: true, seller_id: sellerId });
      }
      await database.query(
        "DELETE FROM public.saved_sellers WHERE buyer_id = $1::uuid AND seller_id = $2::uuid",
        [auth.user.id, sellerId],
      );
      return res.status(200).json({ following: false, seller_id: sellerId });
    } catch {
      return res.status(500).json({ error: "Could not update followed sellers" });
    }
  };
}

export default createSavedSellersHandler();
