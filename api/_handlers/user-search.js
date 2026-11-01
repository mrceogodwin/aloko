import { getPool } from "../_lib/db.js";
import { authorizeStaff } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";

export function createUserSearchHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (!req?.auth?.user) {
      const populated = await populateAuth(req, { database: getDatabase(), bootstrapProfile: false });
      if (!populated.ok) return res.status(populated.status).json({ error: populated.error });
    }
    const auth = authorizeStaff(req, ["moderator", "admin"]);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const query = typeof req.query?.q === "string" ? req.query.q.trim() : "";
    if (query.length < 2) return res.status(400).json({ error: "Enter at least 2 characters to search" });
    if (query.length > 80) return res.status(400).json({ error: "Search query is too long" });
    const database = getDatabase();
    if (!database) return res.status(503).json({ error: "User search is temporarily unavailable" });

    try {
      const result = await database.query(
        `SELECT p.id, p.display_name, p.account_type, p.is_suspended, p.created_at
         FROM public.profiles p
         WHERE (p.display_name ILIKE $1 OR p.id::text = $2)
           AND NOT EXISTS (
             SELECT 1 FROM public.staff_memberships sm
             WHERE sm.user_id = p.id AND sm.is_active = true
           )
         ORDER BY p.created_at DESC
         LIMIT 25`,
        [`%${query.replace(/[\\%_]/g, "\\$&")}%`, query]
      );
      return res.status(200).json({ items: result.rows || [], count: result.rows?.length || 0 });
    } catch {
      return res.status(500).json({ error: "Could not search members" });
    }
  };
}

export default createUserSearchHandler();
