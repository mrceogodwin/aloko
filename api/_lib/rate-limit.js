/**
 * Lightweight in-process rate limiter for serverless handlers.
 * Limits are approximate under multi-instance deploys; pair with edge/WAF limits at launch.
 */

const buckets = new Map();

function clientKey(req, scope) {
  const forwarded = req?.headers?.["x-forwarded-for"] || req?.headers?.["X-Forwarded-For"];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === "string"
      ? forwarded.split(",")[0].trim()
      : "unknown";
  const userId = req?.auth?.user?.id || "anon";
  return `${scope}:${userId}:${ip}`;
}

/**
 * @param {object} req
 * @param {object} options
 * @param {string} options.scope
 * @param {number} [options.limit=30]
 * @param {number} [options.windowMs=60000]
 * @returns {{ ok: true } | { ok: false, status: 429, error: string, retryAfterSec: number }}
 */
export function rateLimit(req, { scope, limit = 30, windowMs = 60_000 } = {}) {
  if (!scope || typeof scope !== "string") {
    return { ok: false, status: 500, error: "Rate limit misconfigured", retryAfterSec: 60 };
  }
  const key = clientKey(req, scope);
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      ok: false,
      status: 429,
      error: "Too many requests. Please wait and try again.",
      retryAfterSec,
    };
  }
  return { ok: true };
}

/** Test helper */
export function clearRateLimitBuckets() {
  buckets.clear();
}
