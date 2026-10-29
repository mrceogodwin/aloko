import test from "node:test";
import assert from "node:assert/strict";
import { createSavedListingsHandler } from "../api/saved-listings.js";
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
const listingId = "22222222-2222-4222-8222-222222222222";

test("saved-listings requires authentication", async () => {
  clearRateLimitBuckets();
  const handler = createSavedListingsHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 401);
});

test("saved-listings lists active saved items", async () => {
  clearRateLimitBuckets();
  const handler = createSavedListingsHandler({
    getDatabase: () => ({
      async query(sql, values) {
        assert.equal(values[0], userId);
        return { rows: [{ id: listingId, title: "Desk", price_kobo: 50000, status: "active" }] };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "GET",
    auth: { user: { id: userId, role: "buyer" } },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.items[0].price_naira, 500);
});

test("saved-listings can save a listing", async () => {
  clearRateLimitBuckets();
  const handler = createSavedListingsHandler({
    getDatabase: () => ({
      async query() { return { rows: [{ listing_id: listingId }] }; },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST",
    body: { listing_id: listingId },
    auth: { user: { id: userId, role: "buyer" } },
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.saved, true);
});
