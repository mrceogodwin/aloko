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

export function createAccountOnboardingHandler({
  getDatabase = getPool,
  authenticate = populateAuth,
} = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const accountType = req.body?.account_type;
    if (
      accountType !== undefined &&
      (typeof accountType !== "string" || !ACCOUNT_TYPES.has(accountType))
    ) {
      return res.status(400).json({ error: "Choose a valid Aloko account type" });
    }

    const database = getDatabase();
    if (!database) {
      return res.status(503).json({ error: "Account setup is temporarily unavailable" });
    }

    const auth = await authenticate(req, {
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
             SET account_type = $1,
                 account_type_selected_at = COALESCE(account_type_selected_at, now()),
                 updated_at = now()
             WHERE id = $2::uuid
               AND (account_type_selected_at IS NULL OR account_type = $1)
             RETURNING id, display_name, account_type, city, state, account_type_selected_at`,
            [accountType, auth.user.id],
          )
        : await database.query(
            `SELECT id, display_name, account_type, city, state, account_type_selected_at
             FROM public.profiles WHERE id = $1::uuid LIMIT 1`,
            [auth.user.id],
          );

      const profile = result.rows?.[0];
      if (!profile) {
        return accountType
          ? res.status(409).json({
              error: "Your primary account type is already set. Use the relevant onboarding flow to add another capability.",
            })
          : res.status(404).json({ error: "Account profile could not be found" });
      }

      return res.status(200).json({ profile });
    } catch {
      return res.status(500).json({ error: "Could not complete account setup" });
    }
  };
}

export default createAccountOnboardingHandler();
