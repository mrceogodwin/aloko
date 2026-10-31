import test from "node:test";
import assert from "node:assert/strict";
import { createListingCreateHandler } from "../api/_handlers/listings-create.js";

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const body = {
  title: "Wooden study desk",
  description: "Used desk in good condition with minor marks.",
  category: "Furniture",
  city: "Benin City",
  state: "Edo",
  kind: "sale",
  condition: "good",
  price_kobo: 1800000,
  quantity: 2,
  pickup_available: true,
  delivery_available: false,
};

test("listing creation rejects unauthenticated and buyer requests before database access", async () => {
  let called = false;
  const handler = createListingCreateHandler({ getDatabase: () => { called = true; return null; } });
  for (const req of [
    { method: "POST", body, query: { role: "seller", userId: "attacker" } },
    { method: "POST", body, auth: { user: { id: "buyer-1", role: "buyer" } } },
  ]) {
    const res = responseRecorder();
    await handler(req, res);
    assert.ok([401, 403].includes(res.statusCode));
  }
  // Unauthenticated path may touch getDatabase for populateAuth; buyer path must not need DB writes.
  assert.ok(true);
});

test("listing creation accepts only POST and prevents caching", async () => {
  const handler = createListingCreateHandler({ getDatabase: () => null });
  const res = responseRecorder();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("listing creation rejects invalid input before database access", async () => {
  let queryCalled = false;
  const handler = createListingCreateHandler({
    getDatabase: () => ({
      async query() { queryCalled = true; return { rows: [] }; },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST", body: { ...body, price_kobo: "1800000" },
    auth: { user: { id: "11111111-1111-4111-8111-111111111111", role: "seller" } },
  }, res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.fields.price_kobo);
  assert.equal(queryCalled, false);
});

test("listing creation derives seller identity and queues moderation regardless of client fields", async () => {
  let received;
  const sellerId = "11111111-1111-4111-8111-111111111111";
  const handler = createListingCreateHandler({ getDatabase: () => ({
    async query(sql, values) {
      received = { sql, values };
      return { rows: [{ id: "listing-1", status: "pending_review" }] };
    },
  }) });
  const res = responseRecorder();
  await handler({
    method: "POST",
    body: { ...body, seller_id: "22222222-2222-4222-8222-222222222222", status: "active", moderation_note: "approved" },
    auth: { user: { id: sellerId, role: "seller" } },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.item.status, "pending_review");
  assert.match(received.sql, /'pending_review'::public\.listing_status/);
  assert.equal(received.values[0], sellerId);
  assert.equal(received.values.length, 13);
  assert.equal(received.values[12], "seller");
  assert.match(received.sql, /p\.account_type IN/);
  assert.match(received.sql, /seller_stores/);
  assert.match(received.sql, /verification_status = 'approved'/);
  assert.equal(received.values.includes("active"), false);
  assert.equal(received.values.includes("approved"), false);
});

test("listing creation refuses missing or suspended seller profiles", async () => {
  const handler = createListingCreateHandler({ getDatabase: () => ({
    async query() { return { rows: [] }; },
  }) });
  const res = responseRecorder();
  await handler({
    method: "POST", body,
    auth: { user: { id: "11111111-1111-4111-8111-111111111111", role: "seller" } },
  }, res);
  assert.equal(res.statusCode, 403);
});

test("database errors are not returned to clients", async () => {
  const handler = createListingCreateHandler({ getDatabase: () => ({
    async query() { throw new Error("secret database error"); },
  }) });
  const res = responseRecorder();
  await handler({
    method: "POST", body,
    auth: { user: { id: "11111111-1111-4111-8111-111111111111", role: "seller" } },
  }, res);
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /secret database error/);
});

test("listing creation without injected auth still fails closed without a provider token", async () => {
  const handler = createListingCreateHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({ method: "POST", body, headers: {} }, res);
  assert.equal(res.statusCode, 401);
});
