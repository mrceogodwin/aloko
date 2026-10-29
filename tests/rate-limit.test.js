import test from "node:test";
import assert from "node:assert/strict";
import { rateLimit, clearRateLimitBuckets } from "../api/_lib/rate-limit.js";

test("rateLimit allows requests under the limit and blocks after", () => {
  clearRateLimitBuckets();
  const req = { headers: { "x-forwarded-for": "1.2.3.4" }, auth: { user: { id: "u1" } } };
  for (let i = 0; i < 3; i += 1) {
    const ok = rateLimit(req, { scope: "test-scope", limit: 3, windowMs: 60_000 });
    assert.equal(ok.ok, true);
  }
  const blocked = rateLimit(req, { scope: "test-scope", limit: 3, windowMs: 60_000 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 429);
  assert.ok(blocked.retryAfterSec >= 1);
});

test("rateLimit isolates different scopes", () => {
  clearRateLimitBuckets();
  const req = { headers: {}, auth: { user: { id: "u2" } } };
  assert.equal(rateLimit(req, { scope: "a", limit: 1 }).ok, true);
  assert.equal(rateLimit(req, { scope: "a", limit: 1 }).ok, false);
  assert.equal(rateLimit(req, { scope: "b", limit: 1 }).ok, true);
});
