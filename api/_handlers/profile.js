import { getPool } from "../_lib/db.js";
import { authorize } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";

const ACCOUNT_TYPES = new Set([
  "buyer",
  "individual",
  "reseller",
  "business",
  "bulk_distributor",
  "decluttering_provider",
]);

export function createProfileHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "PATCH") {
      res.setHeader("Allow", "PATCH");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const database = getDatabase();
    if (!database) {
      return res.status(503).json({ error: "Profile service is temporarily unavailable" });
    }

    if (!req?.auth?.user) {
      const populated = await populateAuth(req, {
        database,
        bootstrapProfile: true,
      });
      if (!populated.ok) {
        return res.status(populated.status).json({ error: populated.error });
      }
    }

    const auth = authorize(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const accountType = req.body?.account_type;
    if (typeof accountType !== "string" || !ACCOUNT_TYPES.has(accountType)) {
      return res.status(400).json({ error: "Choose a valid Aloko account type" });
    }

    try {
      const result = await database.query(
        `UPDATE public.profiles
         SET account_type = $2, updated_at = now()
         WHERE id = $1::uuid AND is_suspended = false
         RETURNING id, display_name, account_type`,
        [auth.user.id, accountType],
      );
      if (!result.rows?.length) {
        return res.status(404).json({ error: "Your Aloko profile could not be found" });
      }
      return res.status(200).json({
        user: result.rows[0],
        message: "Account type saved",
      });
    } catch {
      return res.status(500).json({ error: "Could not save your account type" });
    }
  };
}

export default createProfileHandler();
