import test from "node:test";
import assert from "node:assert/strict";
import { createListingsHandler } from "../api/listings.js";

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("public listings endpoint rejects non-GET requests", async () => {
  let databaseRequested = false;
  const handler = createListingsHandler({ getDatabase: () => { databaseRequested = true; return null; } });
  const res = responseMock();

  await handler({ method: "POST", query: {} }, res);

  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.body, { error: "Method not allowed" });
  assert.equal(res.headers.Allow, "GET");
  assert.equal(databaseRequested, false);
});

test("public listings endpoint returns a safe 503 when database is not configured", async () => {
  const handler = createListingsHandler({ getDatabase: () => null });
  const res = responseMock();

  await handler({ method: "GET", query: {} }, res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: "Marketplace listings are temporarily unavailable" });
});

test("public listings endpoint maps prices and returns pagination metadata", async () => {
  const rows = [
    { id: "one", title: "Chair", price_kobo: 125000 },
    { id: "two", title: "Table", price_kobo: null },
    { id: "extra", title: "Extra row", price_kobo: 50000 },
  ];
  let receivedQuery;
  const database = {
    async query(text, values) {
      receivedQuery = { text, values };
      return { rows };
    },
  };
  const handler = createListingsHandler({ getDatabase: () => database });
  const res = responseMock();

  await handler({ method: "GET", query: { limit: "2", city: "Lagos" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 2);
  assert.equal(res.body.has_more, true);
  assert.deepEqual(res.body.items.map((item) => item.price_naira), [1250, null]);
  assert.equal(res.body.items[0].price_kobo, 125000);
  assert.equal(res.headers["Cache-Control"], "public, s-maxage=30, stale-while-revalidate=60");
  assert.match(receivedQuery.text, /LIMIT/);
  assert.ok(receivedQuery.values.includes("Lagos"));
});

test("public listings endpoint hides database error details", async () => {
  const handler = createListingsHandler({
    getDatabase: () => ({ async query() { throw new Error("private database details"); } }),
  });
  const res = responseMock();

  await handler({ method: "GET", query: {} }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Could not load marketplace listings" });
  assert.equal(JSON.stringify(res.body).includes("private database details"), false);
});
