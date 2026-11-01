import { getPool } from "./_lib/db.js";
import { populateAuth } from "./_lib/populate-auth.js";

const ACCOUNT_TYPES = new Set([
  "buyer",
  "individual",
  "reseller",
  "business",
  "bulk_distributor",
  "decluttering_provider",
]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const accountType = req.body?.account_type;
  if (accountType !== undefined && (typeof accountType !== "string" || !ACCOUNT_TYPES.has(accountType))) {
    return res.status(400).json({ error: "Choose a valid Aloko account type" });
  }

  const database = getPool();
  if (!database) {
    return res.status(503).json({ error: "Account setup is temporarily unavailable" });
  }

  const auth = await populateAuth(req, {
    database,
    bootstrapProfile: true,
  });
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const result = accountType
      ? await database.query(
          `UPDATE public.profiles
           SET account_type = $1, updated_at = now()
           WHERE id = $2::uuid
           RETURNING id, display_name, account_type, city, state`,
          [accountType, auth.user.id],
        )
      : await database.query(
          `SELECT id, display_name, account_type, city, state
           FROM public.profiles WHERE id = $1::uuid LIMIT 1`,
          [auth.user.id],
        );
    const profile = result.rows?.[0];
    if (!profile) {
      return res.status(404).json({ error: "Account profile could not be found" });
    }

    return res.status(200).json({ profile });
  } catch {
    return res.status(500).json({ error: "Could not complete account setup" });
  }
}
