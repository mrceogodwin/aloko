import test from "node:test";
import assert from "node:assert/strict";
import { createListingsStatusHandler } from "../api/listings-status.js";
import { clearRateLimitBuckets } from "../api/_lib/rate-limit.js";

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const sellerId = "11111111-1111-4111-8111-111111111111";
const listingId = "22222222-2222-4222-8222-222222222222";

test("listings-status rejects unauthenticated requests", async () => {
  clearRateLimitBuckets();
  const handler = createListingsStatusHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({ method: "POST", body: { listing_id: listingId, action: "pause" }, headers: {} }, res);
  assert.equal(res.statusCode, 401);
});

test("listings-status pauses an owned active listing", async () => {
  clearRateLimitBuckets();
  let values;
  const handler = createListingsStatusHandler({
    getDatabase: () => ({
      async query(sql, v) {
        values = v;
        return { rows: [{ id: listingId, status: "paused" }] };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST",
    body: { listing_id: listingId, action: "pause" },
    auth: { user: { id: sellerId, role: "seller" } },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(values[0], listingId);
  assert.equal(values[1], sellerId);
  assert.equal(values[2], "paused");
  assert.equal(res.body.item.status, "paused");
});

test("listings-status rejects invalid actions", async () => {
  clearRateLimitBuckets();
  const handler = createListingsStatusHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST",
    body: { listing_id: listingId, action: "delete_forever" },
    auth: { user: { id: sellerId, role: "seller" } },
  }, res);
  assert.equal(res.statusCode, 400);
});
