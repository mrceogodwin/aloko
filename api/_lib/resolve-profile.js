/**
 * Resolve an Aloko marketplace profile from a verified auth provider user ID.
 *
 * Marketplace roles come from the profile account type. Privileged staff roles
 * come only from an active staff_memberships row; clients never supply roles.
 * The staff lookup is optional until migration 002 is present, so older schemas
 * continue to authenticate ordinary marketplace accounts without granting staff.
 *
 * Returns null when the profile is missing or the id is invalid.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SELLER_TYPES = new Set(["individual", "reseller"]);
const BUSINESS_TYPES = new Set(["business", "bulk_distributor"]);
const STAFF_ROLES = new Set(["moderator", "admin"]);

/**
 * Map profile account_type to an application role used by authorize().
 * Staff roles are resolved separately from staff_memberships.
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

    let role = roleFromAccountType(row.account_type);

    // Migration 002 adds this table. A missing table must not break ordinary
    // buyer/seller authentication, but must never create a staff role.
    try {
      const staffResult = await database.query(
        `SELECT role
         FROM public.staff_memberships
         WHERE user_id = $1::uuid
           AND is_active = true
           AND role IN ('moderator'::public.account_role, 'admin'::public.account_role)
         LIMIT 1`,
        [userId],
      );
      const staffRole = staffResult?.rows?.[0]?.role;
      if (STAFF_ROLES.has(staffRole)) role = staffRole;
    } catch {
      // Older branches may not have migration 002 yet. Fail closed for staff.
    }

    return {
      id: row.id,
      role,
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
