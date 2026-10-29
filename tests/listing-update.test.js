import test from "node:test";
import assert from "node:assert/strict";
import { createListingUpdateHandler } from "../api/listings-update.js";

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
const listingId = "22222222-2222-4222-8222-222222222222";
const sellerId = "11111111-1111-4111-8111-111111111111";
const body = {
  title: "Wooden study desk",
  description: "Used desk in good condition with minor marks.",
  category: "Furniture", city: "Benin City", state: "Edo",
  kind: "sale", condition: "good", price_kobo: 1800000, quantity: 2,
  pickup_available: true, delivery_available: false,
};

test("listing update requires seller authentication and a valid listing ID", async () => {
  let queryCalled = false;
  const handler = createListingUpdateHandler({
    getDatabase: () => ({
      async query() {
        queryCalled = true;
        return { rows: [] };
      },
    }),
  });
  const noAuth = responseRecorder();
  await handler({ method: "PATCH", query: { id: listingId }, body, headers: {} }, noAuth);
  assert.equal(noAuth.statusCode, 401);
  assert.equal(queryCalled, false);

  const badId = responseRecorder();
  await handler({
    method: "PATCH",
    query: { id: ["bad", listingId] },
    body,
    auth: { user: { id: sellerId, role: "seller" } },
  }, badId);
  assert.equal(badId.statusCode, 400);
  assert.equal(queryCalled, false);
});

test("listing update only permits PATCH or PUT and is not cached", async () => {
  const handler = createListingUpdateHandler({ getDatabase: () => null });
  const res = responseRecorder();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "PATCH, PUT");
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("listing update checks ownership in SQL and resets edited listings to review", async () => {
  let received;
  const handler = createListingUpdateHandler({ getDatabase: () => ({
    async query(sql, values) {
      received = { sql, values };
      return { rows: [{ id: listingId, status: "pending_review" }] };
    },
  }) });
  const res = responseRecorder();
  await handler({
    method: "PATCH", query: { id: listingId },
    body: { ...body, seller_id: "33333333-3333-4333-8333-333333333333", status: "active" },
    auth: { user: { id: sellerId, role: "seller" } },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(received.values[0], listingId);
  assert.equal(received.values[1], sellerId);
  assert.equal(received.values[13], "seller");
  assert.match(received.sql, /l\.seller_id = \$2::uuid/);
  assert.match(received.sql, /'pending_review'::public\.listing_status/);
  assert.equal(received.values.includes("active"), false);
});

test("listing update hides missing or non-owned listing details", async () => {
  const handler = createListingUpdateHandler({ getDatabase: () => ({
    async query() { return { rows: [] }; },
  }) });
  const res = responseRecorder();
  await handler({
    method: "PATCH", query: { id: listingId }, body,
    auth: { user: { id: sellerId, role: "seller" } },
  }, res);
  assert.equal(res.statusCode, 404);
  assert.doesNotMatch(res.body.error, /another|owner|seller/i);
});

test("invalid listing updates are rejected before database access", async () => {
  let queryCalled = false;
  const handler = createListingUpdateHandler({
    getDatabase: () => ({
      async query() {
        queryCalled = true;
        return { rows: [] };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "PATCH", query: { id: listingId }, body: { ...body, quantity: "2" },
    auth: { user: { id: sellerId, role: "seller" } },
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(queryCalled, false);
});
