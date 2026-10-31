import { getPool } from "../_lib/db.js";
import { authorizeStaff } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createSellerVerificationDecideHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (!req?.auth?.user) {
      const populated = await populateAuth(req, { database: getDatabase(), bootstrapProfile: false });
      if (!populated.ok) return res.status(populated.status).json({ error: populated.error });
    }
    const auth = authorizeStaff(req, ["admin"]);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (!UUID.test(auth.user.id)) return res.status(401).json({ error: "Staff account is not configured" });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const applicationId = typeof body.application_id === "string" ? body.application_id : "";
    const decision = typeof body.decision === "string" ? body.decision.trim().toLowerCase() : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
    if (!UUID.test(applicationId)) return res.status(400).json({ error: "A valid application_id is required" });
    if (!["approve", "reject", "needs_information"].includes(decision)) {
      return res.status(400).json({ error: "decision must be approve, reject or needs_information" });
    }
    if (decision !== "approve" && note.length < 3) {
      return res.status(400).json({ error: "A review note is required for this decision" });
    }
    const database = getDatabase();
    if (!database) return res.status(503).json({ error: "Seller verification is temporarily unavailable" });
    try {
      const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "needs_information";
      const result = await database.query(
        `WITH reviewed AS (
           UPDATE public.verification_applications
           SET status = $2::public.verification_status,
               reviewer_id = $3::uuid, reviewer_note = $4,
               reviewed_at = now(), updated_at = now()
           WHERE id = $1::uuid AND status IN ('pending', 'needs_information')
             AND identity_document_key IS NOT NULL
             AND (subject_type = 'individual_seller' OR cardinality(business_document_keys) > 0)
           RETURNING id, applicant_id, subject_type, status, reviewer_note, reviewed_at
         ),
         store_update AS (
           UPDATE public.seller_stores s
           SET verification_status = r.status, updated_at = now()
           FROM reviewed r
           WHERE s.user_id = r.applicant_id
           RETURNING s.user_id
         )
         SELECT r.id, r.applicant_id, r.subject_type, r.status,
                r.reviewer_note, r.reviewed_at
         FROM reviewed r JOIN store_update s ON s.user_id = r.applicant_id`,
        [applicationId, status, auth.user.id, note || null],
      );
      if (!result.rows?.length) return res.status(404).json({ error: "Application not found or already reviewed" });
      try {
        await database.query(
          `INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
           VALUES ($1::uuid, $2, 'seller_verification', $3, $4::jsonb)`,
          [auth.user.id, `seller_verification_${decision}`, applicationId, JSON.stringify({ status, note })],
        );
      } catch { /* audit logging must not expose internal database errors to reviewers */ }
      return res.status(200).json({
        application: result.rows[0],
        message: decision === "approve" ? "Seller verification approved" :
          decision === "reject" ? "Seller verification rejected" : "More information requested",
      });
    } catch {
      return res.status(500).json({ error: "Could not apply seller verification decision" });
    }
  };
}
export default createSellerVerificationDecideHandler();
