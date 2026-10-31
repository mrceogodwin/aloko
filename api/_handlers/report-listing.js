import { getPool } from "../_lib/db.js";
import { authorize } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
import { rateLimit } from "../_lib/rate-limit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REPORT_SQL = `
  INSERT INTO public.listing_reports (listing_id, reporter_id, reason, details)
  SELECT l.id, $2::uuid, $3, $4
  FROM public.listings l
  WHERE l.id = $1::uuid AND l.status IN ('active', 'pending_review', 'paused')
  RETURNING id, status, created_at
`;

export function createReportListingHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (!req?.auth?.user) {
      const database = getDatabase();
      const populated = await populateAuth(req, { database, bootstrapProfile: true });
      if (!populated.ok) return res.status(populated.status).json({ error: populated.error });
    }

    const limited = rateLimit(req, { scope: "report-listing", limit: 10, windowMs: 60_000 });
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
    const listingId = typeof body.listing_id === "string" ? body.listing_id : "";
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 100) : "";
    const details = typeof body.details === "string" ? body.details.trim().slice(0, 3000) : null;

    if (!UUID.test(listingId)) {
      return res.status(400).json({ error: "A valid listing_id is required" });
    }
    if (reason.length < 3) {
      return res.status(400).json({ error: "A report reason of at least 3 characters is required" });
    }

    const database = getDatabase();
    if (!database) return res.status(503).json({ error: "Reporting is temporarily unavailable" });

    try {
      const result = await database.query(REPORT_SQL, [
        listingId,
        auth.user.id,
        reason,
        details || null,
      ]);
      if (!result.rows?.length) {
        return res.status(404).json({ error: "Listing not found" });
      }
      return res.status(201).json({
        report: result.rows[0],
        message: "Report submitted for review",
      });
    } catch {
      return res.status(500).json({ error: "Could not submit report" });
    }
  };
}

export default createReportListingHandler();
