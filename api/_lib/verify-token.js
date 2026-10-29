/**
 * Fail-closed JWT verification helper for Aloko.
 *
 * When NEON_AUTH_BASE_URL (or explicit JWKS URL) is not configured,
 * or when the token is missing/invalid, this returns null.
 * Protected handlers must treat null as unauthenticated (401).
 *
 * This module does not populate req.auth.user by itself and does not
 * perform profile lookups. That responsibility belongs to the future
 * auth middleware once a provider is enabled and approved.
 *
 * Dependencies: jose (to be added when the provider is wired).
 * For unit tests the verify function can be injected.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Extract a Bearer token from a standard Authorization header value.
 * @param {string | null | undefined} authorizationHeader
 * @returns {string | null}
 */
export function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") return null;
  const match = authorizationHeader.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/**
 * Minimal shape returned on successful verification.
 * @typedef {{ sub: string, payload: Record<string, unknown> }} VerifiedToken
 */

/**
 * Verify a JWT against the configured JWKS.
 * Returns null on any failure or missing configuration (fail closed).
 *
 * @param {string | null | undefined} token
 * @param {object} [options]
 * @param {() => Promise<VerifiedToken | null>} [options.verifyFn] - injectable for tests
 * @param {string} [options.baseUrl] - overrides process.env.NEON_AUTH_BASE_URL
 * @param {string} [options.jwksUrl] - overrides derived or env JWKS URL
 * @returns {Promise<VerifiedToken | null>}
 */
export async function verifyAccessToken(token, options = {}) {
  if (!token || typeof token !== "string" || !token.trim()) return null;

  if (typeof options.verifyFn === "function") {
    try {
      const result = await options.verifyFn();
      if (!result || typeof result.sub !== "string") return null;
      if (!UUID_RE.test(result.sub)) return null;
      return { sub: result.sub, payload: result.payload || {} };
    } catch {
      return null;
    }
  }

  const baseUrl =
    options.baseUrl ||
    process.env.NEON_AUTH_BASE_URL ||
    process.env.AUTH_ISSUER_URL ||
    "";
  const jwksUrl =
    options.jwksUrl ||
    process.env.NEON_AUTH_JWKS_URL ||
    (baseUrl ? `${baseUrl.replace(/\/$/, "")}/.well-known/jwks.json` : "");

  // Fail closed: no configuration means no authenticated user.
  if (!jwksUrl) return null;

  // Real jose verification is intentionally not imported yet.
  // Once the owner enables the provider and installs jose, replace this
  // block with createRemoteJWKSet + jwtVerify. Until then every call
  // returns null so protected routes stay locked.
  return null;
}

/**
 * Convenience: extract Bearer token from a request-like object and verify.
 * @param {{ headers?: Record<string, string | string[] | undefined> }} req
 * @param {object} [options] - passed to verifyAccessToken
 * @returns {Promise<VerifiedToken | null>}
 */
export async function verifyRequestToken(req, options = {}) {
  const raw =
    req?.headers?.authorization ||
    req?.headers?.Authorization ||
    null;
  const header = Array.isArray(raw) ? raw[0] : raw;
  const token = extractBearerToken(header);
  return verifyAccessToken(token, options);
}
