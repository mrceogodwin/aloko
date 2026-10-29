/**
 * Populate req.auth.user from a verified Bearer token + database profile.
 *
 * Fail closed at every step:
 * - missing/invalid token → no auth
 * - token verification fails or unconfigured → no auth
 * - profile missing and bootstrap disabled → no auth
 * - database errors → no auth
 *
 * Does not enable a live provider. verifyAccessToken still returns null until
 * NEON_AUTH_BASE_URL / JWKS is configured and jose verification is turned on.
 */

import { verifyRequestToken } from "./verify-token.js";
import { ensureProfile, resolveProfile } from "./resolve-profile.js";

/**
 * @param {object} req - request-like object (headers, optionally auth)
 * @param {object} [options]
 * @param {{ query: Function } | null} [options.database]
 * @param {boolean} [options.bootstrapProfile=false] - create profile on first auth
 * @param {object} [options.verifyOptions] - forwarded to verifyRequestToken
 * @returns {Promise<{ ok: true, user: { id: string, role: string, suspended: boolean } } | { ok: false, status: number, error: string }>}
 */
export async function populateAuth(req, options = {}) {
  const database = options.database ?? null;
  const bootstrap = options.bootstrapProfile === true;

  const verified = await verifyRequestToken(req, options.verifyOptions || {});
  if (!verified) {
    return { ok: false, status: 401, error: "Authentication required" };
  }

  if (!database) {
    return { ok: false, status: 503, error: "Authentication is temporarily unavailable" };
  }

  let profile = await resolveProfile(verified.sub, database);
  if (!profile && bootstrap) {
    const nameFromToken =
      typeof verified.payload?.name === "string"
        ? verified.payload.name
        : typeof verified.payload?.email === "string"
          ? String(verified.payload.email).split("@")[0]
          : undefined;
    profile = await ensureProfile(verified.sub, database, { displayName: nameFromToken });
  }

  if (!profile) {
    return {
      ok: false,
      status: 401,
      error: "Authenticated account is not configured for marketplace access",
    };
  }

  if (profile.suspended) {
    return { ok: false, status: 403, error: "Account is suspended" };
  }

  const user = {
    id: profile.id,
    role: profile.role,
    suspended: false,
  };

  // Attach for downstream authorize() helpers without mutating unexpected shapes.
  req.auth = { user };
  return { ok: true, user };
}
