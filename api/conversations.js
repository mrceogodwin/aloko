import { getPool } from "./_lib/db.js";
import { authorize } from "./_lib/authz.js";
import { populateAuth } from "./_lib/populate-auth.js";
import { rateLimit } from "./_lib/rate-limit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LIST_SQL = `
  SELECT
    c.id,
    c.listing_id,
    c.buyer_id,
    c.seller_id,
    c.created_at,
    l.title AS listing_title,
    l.status AS listing_status,
    l.price_kobo,
    CASE WHEN c.buyer_id = $1::uuid THEN sp.display_name ELSE bp.display_name END AS counterpart_name,
    (
      SELECT m.body FROM public.messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC
      LIMIT 1
    ) AS last_message,
    (
      SELECT m.created_at FROM public.messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC
      LIMIT 1
    ) AS last_message_at
  FROM public.conversations c
  LEFT JOIN public.listings l ON l.id = c.listing_id
  JOIN public.profiles bp ON bp.id = c.buyer_id
  JOIN public.profiles sp ON sp.id = c.seller_id
  WHERE c.buyer_id = $1::uuid OR c.seller_id = $1::uuid
  ORDER BY COALESCE(
    (SELECT m.created_at FROM public.messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
    c.created_at
  ) DESC
  LIMIT 50
`;

const OPEN_SQL = `
  INSERT INTO public.conversations (listing_id, buyer_id, seller_id)
  SELECT l.id, $1::uuid, l.seller_id
  FROM public.listings l
  WHERE l.id = $2::uuid
    AND l.status = 'active'
    AND l.seller_id <> $1::uuid
  ON CONFLICT (listing_id, buyer_id, seller_id) DO UPDATE
    SET listing_id = EXCLUDED.listing_id
  RETURNING id, listing_id, buyer_id, seller_id, created_at
`;

export function createConversationsHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    if (!req?.auth?.user) {
      const database = getDatabase();
      const populated = await populateAuth(req, { database, bootstrapProfile: true });
      if (!populated.ok) return res.status(populated.status).json({ error: populated.error });
    }

    const limited = rateLimit(req, { scope: "conversations", limit: 40, windowMs: 60_000 });
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
    if (!database) return res.status(503).json({ error: "Messaging is temporarily unavailable" });

    try {
      if (req.method === "GET") {
        const result = await database.query(LIST_SQL, [auth.user.id]);
        const items = (result.rows || []).map((row) => ({
          ...row,
          price_naira: row.price_kobo == null ? null : Number(row.price_kobo) / 100,
          role: row.buyer_id === auth.user.id ? "buyer" : "seller",
        }));
        return res.status(200).json({ items, count: items.length });
      }

      if (req.method === "POST") {
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const listingId = typeof body.listing_id === "string" ? body.listing_id : "";
        if (!UUID.test(listingId)) {
          return res.status(400).json({ error: "A valid listing_id is required" });
        }
        const result = await database.query(OPEN_SQL, [auth.user.id, listingId]);
        if (!result.rows?.length) {
          return res.status(404).json({
            error: "Listing not found, not active, or you cannot message yourself",
          });
        }
        return res.status(201).json({ conversation: result.rows[0] });
      }

      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    } catch {
      return res.status(500).json({ error: "Could not load conversations" });
    }
  };
}

export default createConversationsHandler();
