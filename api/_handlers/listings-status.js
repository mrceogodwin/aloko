import { getPool } from "../_lib/db.js";
import { authorize } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
import { rateLimit } from "../_lib/rate-limit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED = new Set(["pause", "resume", "mark_sold"]);

const STATUS_SQL = `
  UPDATE public.listings l
  SET status = $3::public.listing_status,
      published_at = CASE
        WHEN $3::public.listing_status = 'active' THEN COALESCE(l.published_at, now())
        ELSE l.published_at
      END,
      updated_at = now()
  WHERE l.id = $1::uuid
    AND l.seller_id = $2::uuid
    AND (
      ($3 = 'paused' AND l.status IN ('active', 'pending_review'))
      OR ($3 = 'active' AND l.status = 'paused')
      OR ($3 = 'sold' AND l.status IN ('active', 'paused'))
    )
  RETURNING l.id, l.status, l.published_at, l.updated_at
`;

function mapAction(action) {
  if (action === "pause") return "paused";
  if (action === "resume") return "active";
  if (action === "mark_sold") return "sold";
  return null;
}

export function createListingsStatusHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (!req?.auth?.user) {
      const database = getDatabase();
      const populated = await populateAuth(req, { database, bootstrapProfile: false });
      if (!populated.ok) return res.status(populated.status).json({ error: populated.error });
    }

    const limited = rateLimit(req, { scope: "listings-status", limit: 20, windowMs: 60_000 });
    if (!limited.ok) {
      res.setHeader("Retry-After", String(limited.retryAfterSec));
      return res.status(limited.status).json({ error: limited.error });
    }

    const auth = authorize(req, ["seller", "business"]);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (!UUID.test(auth.user.id)) {
      return res.status(401).json({ error: "Authenticated account is not configured for marketplace access" });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const listingId = typeof body.listing_id === "string" ? body.listing_id : "";
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    if (!UUID.test(listingId)) {
      return res.status(400).json({ error: "A valid listing_id is required" });
    }
    if (!ALLOWED.has(action)) {
      return res.status(400).json({ error: "action must be pause, resume, or mark_sold" });
    }

    const nextStatus = mapAction(action);
    const database = getDatabase();
    if (!database) return res.status(503).json({ error: "Listing updates are temporarily unavailable" });

    try {
      const result = await database.query(STATUS_SQL, [listingId, auth.user.id, nextStatus]);
      if (!result.rows?.length) {
        return res.status(404).json({ error: "Listing not found or status change not allowed" });
      }
      return res.status(200).json({
        item: result.rows[0],
        message: action === "pause"
          ? "Listing paused"
          : action === "resume"
            ? "Listing resumed"
            : "Listing marked as sold",
      });
    } catch {
      return res.status(500).json({ error: "Could not update listing status" });
    }
  };
}

export default createListingsStatusHandler();
