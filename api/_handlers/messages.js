import { getPool } from "../_lib/db.js";
import { authorize } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
import { rateLimit } from "../_lib/rate-limit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ACCESS_SQL = `
  SELECT id, buyer_id, seller_id, listing_id
  FROM public.conversations
  WHERE id = $1::uuid
    AND (buyer_id = $2::uuid OR seller_id = $2::uuid)
`;

const LIST_MESSAGES_SQL = `
  SELECT m.id, m.conversation_id, m.sender_id, m.body, m.read_at, m.created_at,
         p.display_name AS sender_name
  FROM public.messages m
  JOIN public.profiles p ON p.id = m.sender_id
  WHERE m.conversation_id = $1::uuid
  ORDER BY m.created_at ASC
  LIMIT 200
`;

const SEND_SQL = `
  INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES ($1::uuid, $2::uuid, $3)
  RETURNING id, conversation_id, sender_id, body, read_at, created_at
`;

const MARK_READ_SQL = `
  UPDATE public.messages
  SET read_at = now()
  WHERE conversation_id = $1::uuid
    AND sender_id <> $2::uuid
    AND read_at IS NULL
`;

export function createMessagesHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    if (!req?.auth?.user) {
      const database = getDatabase();
      const populated = await populateAuth(req, { database, bootstrapProfile: true });
      if (!populated.ok) return res.status(populated.status).json({ error: populated.error });
    }

    const limited = rateLimit(req, { scope: "messages", limit: 60, windowMs: 60_000 });
    if (!limited.ok) {
      res.setHeader("Retry-After", String(limited.retryAfterSec));
      return res.status(limited.status).json({ error: limited.error });
    }

    const auth = authorize(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (!UUID.test(auth.user.id)) {
      return res.status(401).json({ error: "Authenticated account is not configured for marketplace access" });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const conversationId =
      typeof body.conversation_id === "string"
        ? body.conversation_id
        : typeof req.query?.conversation_id === "string"
          ? req.query.conversation_id
          : "";

    if (!UUID.test(conversationId)) {
      return res.status(400).json({ error: "A valid conversation_id is required" });
    }

    const database = getDatabase();
    if (!database) return res.status(503).json({ error: "Messaging is temporarily unavailable" });

    try {
      const access = await database.query(ACCESS_SQL, [conversationId, auth.user.id]);
      if (!access.rows?.length) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      if (req.method === "GET") {
        await database.query(MARK_READ_SQL, [conversationId, auth.user.id]);
        const result = await database.query(LIST_MESSAGES_SQL, [conversationId]);
        return res.status(200).json({
          conversation: access.rows[0],
          items: result.rows || [],
          count: (result.rows || []).length,
        });
      }

      if (req.method === "POST") {
        const text = typeof body.body === "string" ? body.body.trim() : "";
        if (text.length < 1 || text.length > 4000) {
          return res.status(400).json({ error: "Message body must be 1–4000 characters" });
        }
        const result = await database.query(SEND_SQL, [conversationId, auth.user.id, text]);
        return res.status(201).json({ message: result.rows[0] });
      }

      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    } catch {
      return res.status(500).json({ error: "Could not process messages" });
    }
  };
}

export default createMessagesHandler();
