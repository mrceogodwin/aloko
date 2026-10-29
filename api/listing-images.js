import { getPool } from "./_lib/db.js";
import { authorize } from "./_lib/authz.js";
import { populateAuth } from "./_lib/populate-auth.js";
import { rateLimit } from "./_lib/rate-limit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_IMAGES = 8;
const KEY_RE = /^[a-zA-Z0-9/_\-.]{8,200}$/;

/**
 * Registers storage keys for listing images after client-side upload to object storage.
 * Does not accept binary uploads — only metadata. Storage provider is configured separately.
 */

const OWNED_LISTING_SQL = `
  SELECT id FROM public.listings
  WHERE id = $1::uuid AND seller_id = $2::uuid
    AND status IN ('draft', 'pending_review', 'active', 'paused', 'rejected')
`;

const COUNT_SQL = `
  SELECT count(*)::int AS n FROM public.listing_images WHERE listing_id = $1::uuid
`;

const INSERT_SQL = `
  INSERT INTO public.listing_images (listing_id, storage_key, alt_text, sort_order)
  VALUES ($1::uuid, $2, $3, $4)
  ON CONFLICT (listing_id, storage_key) DO UPDATE
    SET alt_text = EXCLUDED.alt_text,
        sort_order = EXCLUDED.sort_order
  RETURNING id, listing_id, storage_key, alt_text, sort_order, created_at
`;

const LIST_SQL = `
  SELECT id, listing_id, storage_key, alt_text, sort_order, created_at
  FROM public.listing_images
  WHERE listing_id = $1::uuid
  ORDER BY sort_order ASC, created_at ASC
`;

const DELETE_SQL = `
  DELETE FROM public.listing_images li
  USING public.listings l
  WHERE li.id = $1::uuid
    AND li.listing_id = l.id
    AND l.seller_id = $2::uuid
  RETURNING li.id
`;

export function createListingImagesHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    if (!req?.auth?.user) {
      const database = getDatabase();
      const populated = await populateAuth(req, { database, bootstrapProfile: true });
      if (!populated.ok) return res.status(populated.status).json({ error: populated.error });
    }

    const limited = rateLimit(req, { scope: "listing-images", limit: 30, windowMs: 60_000 });
    if (!limited.ok) {
      res.setHeader("Retry-After", String(limited.retryAfterSec));
      return res.status(limited.status).json({ error: limited.error });
    }

    const auth = authorize(req, ["seller", "business"]);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (!UUID.test(auth.user.id)) {
      return res.status(401).json({ error: "Authenticated account is not configured for marketplace access" });
    }

    const database = getDatabase();
    if (!database) return res.status(503).json({ error: "Image management is temporarily unavailable" });

    const body = req.body && typeof req.body === "object" ? req.body : {};

    try {
      if (req.method === "GET") {
        const listingId =
          typeof req.query?.listing_id === "string"
            ? req.query.listing_id
            : typeof body.listing_id === "string"
              ? body.listing_id
              : "";
        if (!UUID.test(listingId)) {
          return res.status(400).json({ error: "A valid listing_id is required" });
        }
        const owned = await database.query(OWNED_LISTING_SQL, [listingId, auth.user.id]);
        if (!owned.rows?.length) {
          return res.status(404).json({ error: "Listing not found" });
        }
        const result = await database.query(LIST_SQL, [listingId]);
        return res.status(200).json({ items: result.rows || [], count: (result.rows || []).length });
      }

      if (req.method === "POST") {
        const listingId = typeof body.listing_id === "string" ? body.listing_id : "";
        const storageKey = typeof body.storage_key === "string" ? body.storage_key.trim() : "";
        const altText = typeof body.alt_text === "string" ? body.alt_text.trim().slice(0, 160) : null;
        const sortOrder = Number.isInteger(body.sort_order) && body.sort_order >= 0
          ? Math.min(body.sort_order, 50)
          : 0;

        if (!UUID.test(listingId)) {
          return res.status(400).json({ error: "A valid listing_id is required" });
        }
        if (!KEY_RE.test(storageKey)) {
          return res.status(400).json({
            error: "storage_key must be a safe object-storage path (8–200 chars)",
          });
        }

        const owned = await database.query(OWNED_LISTING_SQL, [listingId, auth.user.id]);
        if (!owned.rows?.length) {
          return res.status(404).json({ error: "Listing not found" });
        }

        const counted = await database.query(COUNT_SQL, [listingId]);
        const n = counted.rows?.[0]?.n ?? 0;
        if (n >= MAX_IMAGES) {
          return res.status(400).json({ error: `Maximum of ${MAX_IMAGES} images per listing` });
        }

        const result = await database.query(INSERT_SQL, [
          listingId,
          storageKey,
          altText || null,
          sortOrder,
        ]);
        return res.status(201).json({ image: result.rows[0] });
      }

      if (req.method === "DELETE") {
        const imageId = typeof body.image_id === "string" ? body.image_id : "";
        if (!UUID.test(imageId)) {
          return res.status(400).json({ error: "A valid image_id is required" });
        }
        const result = await database.query(DELETE_SQL, [imageId, auth.user.id]);
        if (!result.rows?.length) {
          return res.status(404).json({ error: "Image not found" });
        }
        return res.status(200).json({ deleted: true, id: result.rows[0].id });
      }

      res.setHeader("Allow", "GET, POST, DELETE");
      return res.status(405).json({ error: "Method not allowed" });
    } catch {
      return res.status(500).json({ error: "Could not manage listing images" });
    }
  };
}

export default createListingImagesHandler();
