import { getPool } from "./_lib/db.js";
import { authorizeStaff } from "./_lib/authz.js";
import { populateAuth } from "./_lib/populate-auth.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const APPROVE_SQL = `
  UPDATE public.listings
  SET status = 'active'::public.listing_status,
      published_at = now(),
      moderation_note = NULL,
      updated_at = now()
  WHERE id = $1::uuid
    AND status = 'pending_review'::public.listing_status
  RETURNING id, title, status, published_at, updated_at
`;

const REJECT_SQL = `
  UPDATE public.listings
  SET status = 'rejected'::public.listing_status,
      published_at = NULL,
      moderation_note = $2,
      updated_at = now()
  WHERE id = $1::uuid
    AND status = 'pending_review'::public.listing_status
  RETURNING id, title, status, moderation_note, updated_at
`;

const AUDIT_SQL = `
  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
  VALUES ($1::uuid, $2, 'listing', $3, $4::jsonb)
`;

export function createModerationDecideHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
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
    if (!UUID.test(auth.user.id)) {
      return res.status(401).json({ error: "Authenticated account is not configured for marketplace access" });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const listingId = typeof body.listing_id === "string" ? body.listing_id : "";
    const decision = typeof body.decision === "string" ? body.decision.trim().toLowerCase() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : "";

    if (!UUID.test(listingId)) {
      return res.status(400).json({ error: "A valid listing_id is required" });
    }
    if (decision !== "approve" && decision !== "reject") {
      return res.status(400).json({ error: "decision must be approve or reject" });
    }
    if (decision === "reject" && reason.length < 3) {
      return res.status(400).json({ error: "A rejection reason of at least 3 characters is required" });
    }

    const database = getDatabase();
    if (!database) {
      return res.status(503).json({ error: "Moderation is temporarily unavailable" });
    }

    try {
      const result = decision === "approve"
        ? await database.query(APPROVE_SQL, [listingId])
        : await database.query(REJECT_SQL, [listingId, reason]);

      if (!result.rows?.length) {
        return res.status(404).json({ error: "Listing not found or not pending review" });
      }

      try {
        await database.query(AUDIT_SQL, [
          auth.user.id,
          decision === "approve" ? "approve_listing" : "reject_listing",
          listingId,
          JSON.stringify({
            decision,
            reason: decision === "reject" ? reason : null,
          }),
        ]);
      } catch {
        // Audit failure must not undo a successful moderation decision,
        // but the response still reports success for the listing change.
      }

      return res.status(200).json({
        item: result.rows[0],
        message: decision === "approve"
          ? "Listing approved and published"
          : "Listing rejected",
      });
    } catch {
      return res.status(500).json({ error: "Could not apply moderation decision" });
    }
  };
}

export default createModerationDecideHandler();
