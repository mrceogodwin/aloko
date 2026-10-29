/**
 * Fail-closed JWT verification for Aloko.
 *
 * When NEON_AUTH_BASE_URL / NEON_AUTH_JWKS_URL (or AUTH_ISSUER_URL) is configured,
 * tokens are verified with jose against the provider JWKS.
 * When configuration is missing, or verification fails, returns null.
 *
 * Unit tests may inject options.verifyFn to avoid network calls.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @type {Map<string, ReturnType<typeof createRemoteJWKSet>>} */
const jwksCache = new Map();

function getJwks(jwksUrl) {
  let set = jwksCache.get(jwksUrl);
  if (!set) {
    set = createRemoteJWKSet(new URL(jwksUrl));
    jwksCache.set(jwksUrl, set);
  }
  return set;
}

export function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") return null;
  const match = authorizationHeader.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/**
 * @typedef {{ sub: string, payload: Record<string, unknown> }} VerifiedToken
 */

/**
 * @param {string | null | undefined} token
 * @param {object} [options]
 * @param {() => Promise<VerifiedToken | null>} [options.verifyFn]
 * @param {string} [options.baseUrl]
 * @param {string} [options.jwksUrl]
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

  if (!jwksUrl) return null;

  try {
    const verifyOpts = {};
    if (baseUrl) {
      try {
        verifyOpts.issuer = new URL(baseUrl).origin;
      } catch {
        // Invalid base URL — still attempt signature verification without issuer check.
      }
    }
    const { payload } = await jwtVerify(token, getJwks(jwksUrl), verifyOpts);
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!UUID_RE.test(sub)) return null;
    return { sub, payload: { ...payload } };
  } catch {
    return null;
  }
}

export async function verifyRequestToken(req, options = {}) {
  const raw =
    req?.headers?.authorization ||
    req?.headers?.Authorization ||
    null;
  const header = Array.isArray(raw) ? raw[0] : raw;
  const token = extractBearerToken(header);
  return verifyAccessToken(token, options);
}
