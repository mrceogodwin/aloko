import test from "node:test";
import assert from "node:assert/strict";
import { createBuyerPreferencesHandler } from "../api/_handlers/buyer-preferences.js";
import { clearRateLimitBuckets } from "../api/_lib/rate-limit.js";

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const userId = "11111111-1111-4111-8111-111111111111";
const auth = { user: { id: userId, role: "buyer" } };

test("buyer preferences rejects unauthenticated requests", async () => {
  clearRateLimitBuckets();
  const handler = createBuyerPreferencesHandler({ getDatabase: () => null });
  const res = responseRecorder();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 401);
});

test("buyer preferences reads only the authenticated buyer's record", async () => {
  clearRateLimitBuckets();
  const handler = createBuyerPreferencesHandler({
    getDatabase: () => ({
      async query(sql, values) {
        assert.match(sql, /WHERE user_id = \$1::uuid/);
        assert.equal(values[0], userId);
        return { rows: [{ city: "Lagos", categories: ["Electronics"] }] };
      },
    }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", auth }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.preferences.city, "Lagos");
});

test("buyer preferences validates and saves a buyer's onboarding choices", async () => {
  clearRateLimitBuckets();
  const handler = createBuyerPreferencesHandler({
    getDatabase: () => ({
      async query(sql, values) {
        assert.match(sql, /ON CONFLICT \(user_id\) DO UPDATE/);
        assert.equal(values[0], userId);
        assert.deepEqual(values[1], ["Electronics"]);
        assert.deepEqual(values[2], ["new", "good"]);
        assert.equal(values[7], "Ikeja");
        return { rows: [{ city: "Ikeja", categories: ["Electronics"] }] };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "PUT", auth,
    body: {
      categories: ["Electronics"],
      preferred_conditions: ["new", "good"],
      preferred_brands: ["Samsung"],
      budget_min_kobo: 100000,
      budget_max_kobo: 5000000,
      city: "Ikeja",
      state: "Lagos",
      latitude: 6.6,
      longitude: 3.35,
      search_radius_km: 20,
      fulfilment_preferences: ["pickup", "delivery"],
    },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.preferences.city, "Ikeja");
});

test("buyer preferences rejects invalid budget, coordinates and enum values", async () => {
  clearRateLimitBuckets();
  const handler = createBuyerPreferencesHandler({
    getDatabase: () => ({ async query() { throw new Error("Should not query invalid input"); } }),
  });
  const res = responseRecorder();
  await handler({
    method: "PUT", auth,
    body: { budget_min_kobo: 500, budget_max_kobo: 100, latitude: 7, fulfilment_preferences: ["teleport"] },
  }, res);
  assert.equal(res.statusCode, 400);
});

test("buyer role is required", async () => {
  clearRateLimitBuckets();
  const handler = createBuyerPreferencesHandler({ getDatabase: () => ({ async query() { return { rows: [] }; } }) });
  const res = responseRecorder();
  await handler({ method: "GET", auth: { user: { id: userId, role: "seller" } } }, res);
  assert.equal(res.statusCode, 403);
});
