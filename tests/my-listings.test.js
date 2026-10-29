import test from "node:test";
import assert from "node:assert/strict";
import { createMyListingsHandler } from "../api/my-listings.js";

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const sellerId = "11111111-1111-4111-8111-111111111111";

test("my-listings rejects unauthenticated requests", async () => {
  const handler = createMyListingsHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 401);
});

test("my-listings rejects buyers", async () => {
  const handler = createMyListingsHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({
    method: "GET",
    auth: { user: { id: sellerId, role: "buyer" } },
  }, res);
  assert.equal(res.statusCode, 403);
});

test("my-listings returns only the authenticated seller rows", async () => {
  let receivedId;
  const handler = createMyListingsHandler({
    getDatabase: () => ({
      async query(sql, values) {
        receivedId = values[0];
        assert.match(sql, /seller_id = \$1::uuid/);
        return {
          rows: [{
            id: "22222222-2222-4222-8222-222222222222",
            title: "Desk",
            price_kobo: 100000,
            status: "pending_review",
          }],
        };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "GET",
    auth: { user: { id: sellerId, role: "seller" } },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(receivedId, sellerId);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.items[0].price_naira, 1000);
  assert.equal(res.headers["Cache-Control"], "no-store");
});
