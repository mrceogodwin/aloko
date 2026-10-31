import test from "node:test";
import assert from "node:assert/strict";
import { createSavedSellersHandler } from "../api/_handlers/saved-sellers.js";
import { clearRateLimitBuckets } from "../api/_lib/rate-limit.js";

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const buyerId = "11111111-1111-4111-8111-111111111111";
const sellerId = "22222222-2222-4222-8222-222222222222";
const auth = { user: { id: buyerId, role: "buyer" } };

test("seller follows require buyer authentication", async () => {
  clearRateLimitBuckets();
  const handler = createSavedSellersHandler({ getDatabase: () => null });
  const res = responseRecorder();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 401);
});

test("buyer can list followed sellers", async () => {
  clearRateLimitBuckets();
  const handler = createSavedSellersHandler({
    getDatabase: () => ({ async query(sql, values) {
      assert.equal(values[0], buyerId);
      assert.match(sql, /saved_sellers/);
      return { rows: [{ seller_id: sellerId, display_name: "Ada" }] };
    } }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", auth }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.items[0].seller_id, sellerId);
});

test("buyer can follow a seller without supplying their own identity", async () => {
  clearRateLimitBuckets();
  const handler = createSavedSellersHandler({
    getDatabase: () => ({ async query(sql, values) {
      assert.equal(values[0], buyerId);
      assert.equal(values[1], sellerId);
      return { rows: [{ seller_id: sellerId }] };
    } }),
  });
  const res = responseRecorder();
  await handler({ method: "POST", auth, body: { seller_id: sellerId } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.following, true);
});

test("buyer cannot follow themselves", async () => {
  clearRateLimitBuckets();
  const handler = createSavedSellersHandler({ getDatabase: () => ({ async query() { throw new Error("must not query"); } }) });
  const res = responseRecorder();
  await handler({ method: "POST", auth, body: { seller_id: buyerId } }, res);
  assert.equal(res.statusCode, 400);
});

test("seller accounts cannot use buyer follow management", async () => {
  clearRateLimitBuckets();
  const handler = createSavedSellersHandler({ getDatabase: () => ({ async query() { return { rows: [] }; } }) });
  const res = responseRecorder();
  await handler({ method: "GET", auth: { user: { id: buyerId, role: "seller" } } }, res);
  assert.equal(res.statusCode, 403);
});
