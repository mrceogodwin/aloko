import test from "node:test";
import assert from "node:assert/strict";
import { createListingsDetailHandler } from "../api/_handlers/listings-detail.js";

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const listingId = "22222222-2222-4222-8222-222222222222";

test("listing detail requires a valid UUID", async () => {
  const handler = createListingsDetailHandler({ getDatabase: () => null });
  const res = responseRecorder();
  await handler({ method: "GET", query: { id: "not-uuid" } }, res);
  assert.equal(res.statusCode, 400);
});

test("listing detail returns 404 when not found or not active", async () => {
  const handler = createListingsDetailHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", query: { id: listingId } }, res);
  assert.equal(res.statusCode, 404);
});

test("listing detail returns active listing with price_naira", async () => {
  const handler = createListingsDetailHandler({
    getDatabase: () => ({
      async query(sql, values) {
        assert.equal(values[0], listingId);
        assert.match(sql, /status = 'active'/);
        return {
          rows: [{
            id: listingId,
            title: "Desk",
            description: "A solid wooden desk for study",
            category: "Furniture",
            kind: "sale",
            condition: "good",
            price_kobo: 1500000,
            quantity: 1,
            city: "Benin City",
            state: "Edo",
            pickup_available: true,
            delivery_available: false,
            status: "active",
            published_at: "2026-10-01T00:00:00Z",
            created_at: "2026-09-01T00:00:00Z",
            seller_display_name: "Ada",
            seller_account_type: "individual",
          }],
        };
      },
    }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", query: { id: listingId } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.item.price_naira, 15000);
  assert.equal(res.body.item.seller_display_name, "Ada");
});

test("listing detail rejects non-GET methods", async () => {
  const handler = createListingsDetailHandler({ getDatabase: () => null });
  const res = responseRecorder();
  await handler({ method: "POST", query: { id: listingId } }, res);
  assert.equal(res.statusCode, 405);
});
