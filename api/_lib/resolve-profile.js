/**
 * Resolve an Aloko marketplace profile from a verified auth provider user ID.
 *
 * Role is derived server-side from profile.account_type (and later staff_memberships
 * once migration 002 is applied). Clients never supply the role.
 *
 * Returns null when the profile is missing or the id is invalid so callers fail closed.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SELLER_TYPES = new Set(["individual", "reseller"]);
const BUSINESS_TYPES = new Set(["business", "bulk_distributor"]);

/**
 * Map profile account_type to an application role used by authorize().
 * Staff roles (moderator/admin) are not derived here until staff_memberships exists.
 * @param {string} accountType
 * @returns {string}
 */
export function roleFromAccountType(accountType) {
  if (accountType === "buyer") return "buyer";
  if (SELLER_TYPES.has(accountType)) return "seller";
  if (BUSINESS_TYPES.has(accountType)) return "business";
  if (accountType === "decluttering_provider") return "service_provider";
  return "buyer";
}

/**
 * @param {string} userId - verified auth provider subject (must be UUID)
 * @param {{ query: Function }} database - pg-compatible client/pool
 * @returns {Promise<{ id: string, role: string, suspended: boolean, account_type: string, display_name: string | null } | null>}
 */
export async function resolveProfile(userId, database) {
  if (!userId || typeof userId !== "string" || !UUID_RE.test(userId)) return null;
  if (!database || typeof database.query !== "function") return null;

  try {
    const result = await database.query(
      `SELECT id, account_type, is_suspended, display_name
       FROM public.profiles
       WHERE id = $1::uuid
       LIMIT 1`,
      [userId],
    );
    const row = result?.rows?.[0];
    if (!row) return null;

    return {
      id: row.id,
      role: roleFromAccountType(row.account_type),
      suspended: row.is_suspended === true,
      account_type: row.account_type,
      display_name: row.display_name ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Create a minimal buyer profile for a newly authenticated user.
 * Only call after the auth provider has verified the identity.
 * Uses ON CONFLICT DO NOTHING so concurrent first-logins stay safe.
 *
 * @param {string} userId
 * @param {{ query: Function }} database
 * @param {{ displayName?: string }} [options]
 * @returns {Promise<{ id: string, role: string, suspended: boolean, account_type: string, display_name: string | null } | null>}
 */
export async function ensureProfile(userId, database, options = {}) {
  if (!userId || typeof userId !== "string" || !UUID_RE.test(userId)) return null;
  if (!database || typeof database.query !== "function") return null;

  const displayName =
    typeof options.displayName === "string" && options.displayName.trim().length >= 2
      ? options.displayName.trim().slice(0, 80)
      : "Aloko member";

  try {
    await database.query(
      `INSERT INTO public.profiles (id, display_name, account_type, is_suspended)
       VALUES ($1::uuid, $2, 'buyer', false)
       ON CONFLICT (id) DO NOTHING`,
      [userId, displayName],
    );
    return resolveProfile(userId, database);
  } catch {
    return null;
  }
}
