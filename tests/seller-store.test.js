import test from "node:test";
import assert from "node:assert/strict";
import { createSellerStoreHandler } from "../api/_handlers/seller-store.js";

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const sellerId = "11111111-1111-4111-8111-111111111111";

test("seller storefront requires a valid seller UUID", async () => {
  const handler = createSellerStoreHandler({ getDatabase: () => null });
  const res = responseRecorder();
  await handler({ method: "GET", query: { seller_id: "invalid" } }, res);
  assert.equal(res.statusCode, 400);
});

test("seller storefront returns 404 for missing or suspended profiles", async () => {
  const handler = createSellerStoreHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", query: { seller_id: sellerId } }, res);
  assert.equal(res.statusCode, 404);
});

test("seller storefront returns public profile and active listings only", async () => {
  let calls = 0;
  const handler = createSellerStoreHandler({
    getDatabase: () => ({
      async query(sql, values) {
        assert.equal(values[0], sellerId);
        calls += 1;
        if (calls === 1) {
          assert.match(sql, /is_suspended = false/);
          return { rows: [{ id: sellerId, display_name: "Ada", account_type: "business", city: "Lagos", state: "Lagos", avatar_url: null }] };
        }
        assert.match(sql, /status = 'active'/);
        return { rows: [{ id: "22222222-2222-4222-8222-222222222222", seller_id: sellerId, title: "Desk", price_kobo: 1250000, status: "active" }] };
      },
    }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", query: { seller_id: sellerId } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.store.display_name, "Ada");
  assert.equal(res.body.items[0].price_naira, 12500);
  assert.equal(res.body.count, 1);
  assert.equal(res.headers["Cache-Control"], "public, s-maxage=60, stale-while-revalidate=120");
});

test("seller storefront rejects non-GET methods", async () => {
  const handler = createSellerStoreHandler({ getDatabase: () => null });
  const res = responseRecorder();
  await handler({ method: "POST", query: { seller_id: sellerId } }, res);
  assert.equal(res.statusCode, 405);
});
