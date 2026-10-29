import { getPool } from "./_lib/db.js";
import { authorizeStaff } from "./_lib/authz.js";
import { populateAuth } from "./_lib/populate-auth.js";

const QUEUE_SQL = `
  SELECT
    l.id, l.title, l.description, l.category, l.kind, l.condition,
    l.price_kobo, l.quantity, l.city, l.state, l.status,
    l.created_at, l.updated_at,
    p.id AS seller_id, p.display_name AS seller_display_name, p.account_type AS seller_account_type
  FROM public.listings l
  JOIN public.profiles p ON p.id = l.seller_id
  WHERE l.status = 'pending_review'
  ORDER BY l.created_at ASC
  LIMIT 50
`;

export function createModerationQueueHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (!req?.auth?.user) {
      const database = getDatabase();
      const populated = await populateAuth(req, { database, bootstrapProfile: false });
      if (!populated.ok) {
        return res.status(populated.status).json({ error: populated.error });
      }
    }

    const auth = authorizeStaff(req, ["moderator", "admin"]);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const database = getDatabase();
    if (!database) {
      return res.status(503).json({ error: "Moderation queue is temporarily unavailable" });
    }

    try {
      const result = await database.query(QUEUE_SQL);
      const items = (result.rows || []).map((row) => ({
        ...row,
        price_naira: row.price_kobo === null ? null : Number(row.price_kobo) / 100,
      }));
      return res.status(200).json({ items, count: items.length });
    } catch {
      return res.status(500).json({ error: "Could not load moderation queue" });
    }
  };
}

export default createModerationQueueHandler();
