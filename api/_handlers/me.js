import { getPool } from "../_lib/db.js";
import { authorize } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
import { resolveProfile } from "../_lib/resolve-profile.js";

export function createMeHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (!req?.auth?.user) {
      const database = getDatabase();
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

    const database = getDatabase();
    if (!database) {
      return res.status(503).json({ error: "Profile service is temporarily unavailable" });
    }

    const profile = await resolveProfile(auth.user.id, database);
    if (!profile) {
      return res.status(401).json({
        error: "Authenticated account is not configured for marketplace access",
      });
    }

    return res.status(200).json({
      user: {
        id: profile.id,
        role: profile.role,
        account_type: profile.account_type,
        display_name: profile.display_name,
        suspended: profile.suspended,
      },
    });
  };
}

export default createMeHandler();
