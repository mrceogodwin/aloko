/**
 * Resolve an Aloko marketplace profile from a verified auth provider user ID.
 *
 * Marketplace roles come from profile.account_type. Privileged staff roles come
 * only from an active staff_memberships row; clients never supply roles.
 * If migration 002 is not yet present, ordinary accounts still authenticate,
 * but no staff privilege is granted.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SELLER_TYPES = new Set(["individual", "reseller"]);
const BUSINESS_TYPES = new Set(["business", "bulk_distributor"]);
const STAFF_ROLES = new Set(["moderator", "admin"]);

export function roleFromAccountType(accountType) {
  if (accountType === "buyer") return "buyer";
  if (SELLER_TYPES.has(accountType)) return "seller";
  if (BUSINESS_TYPES.has(accountType)) return "business";
  if (accountType === "decluttering_provider") return "service_provider";
  return "buyer";
}

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
      // Migration 002 may not be installed on an older development branch.
      // Fail closed for staff while preserving ordinary marketplace access.
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
