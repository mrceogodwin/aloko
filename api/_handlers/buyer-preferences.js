import { getPool } from "../_lib/db.js";
import { authorize } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
import { rateLimit } from "../_lib/rate-limit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_CONDITIONS = new Set(["new", "like_new", "good", "fair", "for_parts"]);
const ALLOWED_FULFILMENT = new Set(["pickup", "delivery"]);

export function createBuyerPreferencesHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    const database = getDatabase();
    if (!req?.auth?.user) {
      const populated = await populateAuth(req, { database, bootstrapProfile: true });
      if (!populated.ok) return res.status(populated.status).json({ error: populated.error });
    }
    const auth = authorize(req, ["buyer"]);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (!UUID.test(auth.user.id)) return res.status(401).json({ error: "Marketplace account is not configured" });
    const limited = rateLimit(req, { scope: "buyer-preferences", limit: 20, windowMs: 60000 });
    if (!limited.ok) {
      res.setHeader("Retry-After", String(limited.retryAfterSec));
      return res.status(limited.status).json({ error: limited.error });
    }
    if (!database) return res.status(503).json({ error: "Buyer preferences are temporarily unavailable" });
    try {
      if (req.method === "GET") {
        const result = await database.query(
          "SELECT categories, preferred_conditions, preferred_brands, budget_min_kobo, budget_max_kobo, location_label, city, state, latitude, longitude, search_radius_km, fulfilment_preferences, onboarding_completed_at FROM public.buyer_preferences WHERE user_id = $1::uuid",
          [auth.user.id],
        );
        return res.status(200).json({ preferences: result.rows?.[0] || null });
      }
      if (req.method !== "PUT") {
        res.setHeader("Allow", "GET, PUT");
        return res.status(405).json({ error: "Method not allowed" });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const list = (value, max, size) => {
        if (value == null) return [];
        if (!Array.isArray(value) || value.length > max) return null;
        const items = value.map((v) => typeof v === "string" ? v.trim() : "");
        if (items.some((v) => !v || v.length > size)) return null;
        return [...new Set(items)];
      };
      const categories = list(body.categories, 20, 80);
      const conditions = list(body.preferred_conditions, 5, 20);
      const brands = list(body.preferred_brands, 30, 80);
      const fulfilment = list(body.fulfilment_preferences, 2, 20);
      const min = body.budget_min_kobo == null ? null : Number(body.budget_min_kobo);
      const max = body.budget_max_kobo == null ? null : Number(body.budget_max_kobo);
      const lat = body.latitude == null ? null : Number(body.latitude);
      const lng = body.longitude == null ? null : Number(body.longitude);
      const radius = body.search_radius_km == null ? 25 : Number(body.search_radius_km);
      const text = (v, limit) => v == null || v === "" ? null : typeof v === "string" && v.trim().length <= limit ? v.trim() : undefined;
      const location = text(body.location_label, 120);
      const city = text(body.city, 100);
      const state = text(body.state, 100);
      if (!categories || !conditions || !brands || !fulfilment ||
          conditions.some((v) => !ALLOWED_CONDITIONS.has(v)) ||
          fulfilment.some((v) => !ALLOWED_FULFILMENT.has(v)) ||
          (min !== null && (!Number.isFinite(min) || min < 0)) ||
          (max !== null && (!Number.isFinite(max) || max < 0 || (min !== null && max < min))) ||
          (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) ||
          (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) ||
          ((lat === null) !== (lng === null)) ||
          !Number.isInteger(radius) || radius < 1 || radius > 250 ||
          location === undefined || city === undefined || state === undefined) {
        return res.status(400).json({ error: "Invalid buyer preferences" });
      }
      const result = await database.query(
        `INSERT INTO public.buyer_preferences (
          user_id, categories, preferred_conditions, preferred_brands,
          budget_min_kobo, budget_max_kobo, location_label, city, state,
          latitude, longitude, search_radius_km, fulfilment_preferences,
          onboarding_completed_at, updated_at
        ) VALUES ($1::uuid, $2::text[], $3::public.item_condition[], $4::text[],
          $5, $6, $7, $8, $9, $10, $11, $12, $13::text[], now(), now())
        ON CONFLICT (user_id) DO UPDATE SET
          categories = EXCLUDED.categories, preferred_conditions = EXCLUDED.preferred_conditions,
          preferred_brands = EXCLUDED.preferred_brands, budget_min_kobo = EXCLUDED.budget_min_kobo,
          budget_max_kobo = EXCLUDED.budget_max_kobo, location_label = EXCLUDED.location_label,
          city = EXCLUDED.city, state = EXCLUDED.state, latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude, search_radius_km = EXCLUDED.search_radius_km,
          fulfilment_preferences = EXCLUDED.fulfilment_preferences,
          onboarding_completed_at = now(), updated_at = now()
        RETURNING categories, preferred_conditions, preferred_brands, budget_min_kobo,
          budget_max_kobo, location_label, city, state, latitude, longitude,
          search_radius_km, fulfilment_preferences, onboarding_completed_at`,
        [auth.user.id, categories, conditions, brands, min, max, location, city, state, lat, lng, radius, fulfilment],
      );
      return res.status(200).json({ preferences: result.rows?.[0] || null, message: "Buyer preferences saved" });
    } catch {
      return res.status(500).json({ error: "Could not save buyer preferences" });
    }
  };
}

export default createBuyerPreferencesHandler();
