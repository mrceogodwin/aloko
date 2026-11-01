import { getPool } from "../_lib/db.js";
import { authorizeStaff } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LOAD_PENDING_SQL = `
  SELECT id, seller_id, title, status, kind
  FROM public.listings
  WHERE id = $1::uuid
    AND status = 'pending_review'::public.listing_status
`;

const APPROVE_SQL = `
  WITH changed AS (
    UPDATE public.listings SET status='active'::public.listing_status,published_at=now(),moderation_note=NULL,updated_at=now()
    WHERE id=$1::uuid AND status='pending_review'::public.listing_status
    RETURNING id,title,status,published_at,updated_at,seller_id,kind
  ), logged AS (
    INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,details)
    SELECT $2::uuid,'approve_listing','listing',id,jsonb_build_object('decision','approve','credit_charged_at_submission',kind <> 'giveaway') FROM changed
    RETURNING target_id
  )
  SELECT changed.* FROM changed JOIN logged ON logged.target_id=changed.id
`;
const REJECT_SQL = `
  WITH changed AS (
    UPDATE public.listings SET status='rejected'::public.listing_status,published_at=NULL,moderation_note=$2,updated_at=now()
    WHERE id=$1::uuid AND status='pending_review'::public.listing_status
    RETURNING id,title,status,moderation_note,updated_at,seller_id,kind
  ), logged AS (
    INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,details)
    SELECT $3::uuid,'reject_listing','listing',id,jsonb_build_object('decision','reject','reason',$2) FROM changed
    RETURNING target_id
  )
  SELECT changed.* FROM changed JOIN logged ON logged.target_id=changed.id
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
      if (decision === "reject") {
        const result = await database.query(REJECT_SQL, [listingId, reason, auth.user.id]);
        if (!result.rows?.length) {
          return res.status(404).json({ error: "Listing not found or not pending review" });
        }
        return res.status(200).json({
          item: result.rows[0],
          message: "Listing rejected",
        });
      }

      // The listing submission endpoint already debits one credit atomically
      // when it creates the pending_review listing. Moderation must not debit
      // a second time; approval only changes the listing's publication state.
      const pending = await database.query(LOAD_PENDING_SQL, [listingId]);
      if (!pending.rows?.length) {
        return res.status(404).json({ error: "Listing not found or not pending review" });
      }
      const listing = pending.rows[0];

      const result = await database.query(APPROVE_SQL, [listingId, auth.user.id]);
      if (!result.rows?.length) {
        return res.status(404).json({ error: "Listing not found or not pending review" });
      }


      return res.status(200).json({
        item: result.rows[0],
        message: "Listing approved and published",
      });
    } catch {
      return res.status(500).json({ error: "Could not apply moderation decision" });
    }
  };
}

export default createModerationDecideHandler();
