import { getPool } from "../_lib/db.js";
import { authorize } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
import { rateLimit } from "../_lib/rate-limit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createSellerOnboardingHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    const database = getDatabase();
    if (!req?.auth?.user) {
      const populated = await populateAuth(req, { database, bootstrapProfile: true });
      if (!populated.ok) return res.status(populated.status).json({ error: populated.error });
    }
    const auth = authorize(req, ["buyer", "seller", "business"]);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (!UUID.test(auth.user.id)) return res.status(401).json({ error: "Marketplace account is not configured" });
    const limited = rateLimit(req, { scope: "seller-onboarding", limit: 8, windowMs: 60000 });
    if (!limited.ok) {
      res.setHeader("Retry-After", String(limited.retryAfterSec));
      return res.status(limited.status).json({ error: limited.error });
    }
    if (!database) return res.status(503).json({ error: "Seller onboarding is temporarily unavailable" });

    try {
      if (req.method === "GET") {
        const result = await database.query(
          `SELECT s.store_slug, s.account_kind, s.store_name, s.description,
                  s.logo_url, s.business_name, s.category, s.city, s.state,
                  s.service_areas, s.pickup_available, s.delivery_available,
                  s.verification_status, s.updated_at,
                  a.id AS application_id, a.legal_name, a.contact_email,
                  a.contact_phone, a.status AS application_status, a.submitted_at,
                  a.reviewer_note
           FROM public.seller_stores s
           LEFT JOIN LATERAL (
             SELECT id, legal_name, contact_email, contact_phone, status, submitted_at, reviewer_note
             FROM public.verification_applications
             WHERE applicant_id = s.user_id
             ORDER BY submitted_at DESC LIMIT 1
           ) a ON true
           WHERE s.user_id = $1::uuid`,
          [auth.user.id],
        );
        return res.status(200).json({ onboarding: result.rows?.[0] || null });
      }
      if (req.method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ error: "Method not allowed" });
      }

      const body = req.body && typeof req.body === "object" ? req.body : {};
      const kind = body.account_kind;
      const business = kind === "business_seller";
      if (!business && kind !== "individual_seller") {
        return res.status(400).json({ error: "Choose individual_seller or business_seller" });
      }
      if ((auth.user.role === "seller" && business) || (auth.user.role === "business" && !business)) {
        return res.status(409).json({ error: "Your existing seller account type cannot be changed here. Contact support." });
      }
      const clean = (value, max) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
      const storeName = clean(body.store_name, 100);
      const slug = typeof body.store_slug === "string" ? body.store_slug.trim().toLowerCase() : "";
      const legalName = clean(body.legal_name, 160);
      const phone = clean(body.contact_phone, 40);
      const email = body.contact_email == null || body.contact_email === "" ? null : clean(body.contact_email, 254);
      const businessName = business ? clean(body.business_name, 160) : null;
      const cac = business ? clean(body.cac_registration_number, 80) : null;
      const category = clean(body.category, 80);
      const city = clean(body.city, 100);
      const state = clean(body.state, 100);
      const description = body.description == null || body.description === "" ? null : clean(body.description, 2000);
      const logoUrl = body.logo_url == null || body.logo_url === "" ? null : clean(body.logo_url, 500);
      const areas = body.service_areas == null ? [] : body.service_areas;
      const pickup = body.pickup_available == null ? true : body.pickup_available;
      const delivery = body.delivery_available == null ? false : body.delivery_available;

      if (!storeName || !SLUG.test(slug) || !legalName || !phone ||
          (body.contact_email && (!email || !EMAIL.test(email))) ||
          (business && (!businessName || !cac)) ||
          (!business && (body.business_name || body.cac_registration_number)) ||
          (body.description && !description) || (body.logo_url && !logoUrl) ||
          !Array.isArray(areas) || areas.length > 30 ||
          areas.some((v) => typeof v !== "string" || !v.trim() || v.trim().length > 100) ||
          typeof pickup !== "boolean" || typeof delivery !== "boolean" || (!pickup && !delivery) ||
          !category || !city || !state) {
        return res.status(400).json({ error: "Please provide valid store, contact, location and seller details. CAC details are only for registered businesses." });
      }

      const accountType = business ? "business" : "individual";
      const result = await database.query(
        `WITH eligible_profile AS (
           UPDATE public.profiles
           SET account_type = $2, updated_at = now()
           WHERE id = $1::uuid AND is_suspended = false
             AND (account_type = 'buyer' OR account_type = $2)
           RETURNING id
         ),
         saved_store AS (
           INSERT INTO public.seller_stores (
             user_id, store_slug, account_kind, store_name, description, logo_url,
             business_name, cac_registration_number, category, city, state,
             service_areas, pickup_available, delivery_available,
             verification_status, updated_at
           )
           SELECT id, $3, $4::public.verification_subject, $5, $6, $7,
                  $8, $9, $10, $11, $12, $13::text[], $14, $15,
                  'pending'::public.verification_status, now()
           FROM eligible_profile
           ON CONFLICT (user_id) DO UPDATE SET
             store_slug = EXCLUDED.store_slug, account_kind = EXCLUDED.account_kind,
             store_name = EXCLUDED.store_name, description = EXCLUDED.description,
             logo_url = EXCLUDED.logo_url, business_name = EXCLUDED.business_name,
             cac_registration_number = EXCLUDED.cac_registration_number,
             category = EXCLUDED.category, city = EXCLUDED.city, state = EXCLUDED.state,
             service_areas = EXCLUDED.service_areas, pickup_available = EXCLUDED.pickup_available,
             delivery_available = EXCLUDED.delivery_available,
             verification_status = 'pending', updated_at = now()
           RETURNING user_id
         ),
         submitted_application AS (
           INSERT INTO public.verification_applications (
             applicant_id, subject_type, legal_name, business_name,
             cac_registration_number, contact_email, contact_phone, status
           )
           SELECT user_id, $4::public.verification_subject, $16, $8, $9, $17, $18,
                  'pending'::public.verification_status
           FROM saved_store
           RETURNING id, status, submitted_at
         )
         SELECT a.id AS application_id, a.status AS application_status,
                a.submitted_at, s.user_id
         FROM submitted_application a CROSS JOIN saved_store s`,
        [auth.user.id, accountType, slug, kind, storeName, description, logoUrl,
          businessName, cac, category, city, state, areas.map((v) => v.trim()),
          pickup, delivery, legalName, email, phone],
      );
      if (!result.rows?.length) {
        return res.status(409).json({ error: "Seller account could not be created for this profile" });
      }
      return res.status(201).json({
        application: {
          id: result.rows[0].application_id,
          status: result.rows[0].application_status,
          submitted_at: result.rows[0].submitted_at,
        },
        message: "Seller application submitted. Selling access remains locked until verification is approved.",
      });
    } catch (error) {
      if (error?.code === "23505") return res.status(409).json({ error: "That store URL is already in use. Choose another." });
      return res.status(500).json({ error: "Could not submit seller onboarding" });
    }
  };
}

export default createSellerOnboardingHandler();
