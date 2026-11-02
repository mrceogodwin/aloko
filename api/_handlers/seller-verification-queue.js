import { getPool } from "../_lib/db.js";
import { authorizeStaff } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";

export function createSellerVerificationQueueHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!req?.auth?.user) {
      const populated = await populateAuth(req, { database: getDatabase(), bootstrapProfile: false });
      if (!populated.ok) return res.status(populated.status).json({ error: populated.error });
    }
    const auth = authorizeStaff(req, ["moderator", "admin"]);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }
    const database = getDatabase();
    if (!database) return res.status(503).json({ error: "Verification queue is temporarily unavailable" });
    try {
      const result = await database.query(
        `SELECT a.id, a.applicant_id, a.subject_type, a.legal_name,
                a.business_name, a.cac_registration_number, a.contact_email,
                a.contact_phone, a.status, a.submitted_at, a.updated_at,
                p.display_name, p.account_type, s.store_name, s.store_slug,
                s.category, s.city, s.state
         FROM public.verification_applications a
         JOIN public.profiles p ON p.id = a.applicant_id
         LEFT JOIN public.seller_stores s ON s.user_id = a.applicant_id
         WHERE a.status IN ('pending', 'needs_information')
         ORDER BY a.submitted_at ASC
         LIMIT 100`,
      );
      return res.status(200).json({ items: result.rows || [], count: result.rows?.length || 0 });
    } catch {
      return res.status(500).json({ error: "Could not load seller verification queue" });
    }
  };
}
export default createSellerVerificationQueueHandler();
