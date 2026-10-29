import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicListingsQuery } from "../api/listings-query.js";
import { createListingsHandler } from "../api/listings.js";

test("public listing query only includes active listings", () => {
  const query = buildPublicListingsQuery({});
  assert.match(query.text, /l\.status = 'active'/);
  assert.deepEqual(query.values, [24, 0]);
});

test("search uses bound parameters and cannot inject SQL", () => {
  const query = buildPublicListingsQuery({ q: "' OR 1=1 --" });
  assert.match(query.text, /ILIKE/);
  assert.equal(query.text.includes("' OR 1=1 --"), false);
  assert.deepEqual(query.values, ["' OR 1=1 --", "' OR 1=1 --", "' OR 1=1 --", 24, 0]);
});

test("category and location filters are parameterized", () => {
  const query = buildPublicListingsQuery({ category: "Furniture", city: "Benin City", state: "Edo" });
  assert.match(query.text, /l\.category = \$1/);
  assert.match(query.text, /l\.city = \$2/);
  assert.match(query.text, /l\.state = \$3/);
  assert.deepEqual(query.values, ["Furniture", "Benin City", "Edo", 24, 0]);
});

test("price bounds, sort order, limit and offset are bounded", () => {
  const query = buildPublicListingsQuery({ minPrice: "20000", maxPrice: "90000", sort: "price_low", limit: "1000", offset: "-2" });
  assert.match(query.text, /l\.price_kobo ASC/);
  assert.deepEqual(query.values, [20000, 90000, 48, 0]);
});

test("invalid numeric filters are ignored and unknown sort falls back safely", () => {
  const query = buildPublicListingsQuery({ minPrice: "NaN", maxPrice: "-4", sort: "title; DROP TABLE listings" });
  assert.doesNotMatch(query.text, /DROP TABLE/);
  assert.deepEqual(query.values, [24, 0]);
});

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

test("endpoint rejects non-GET requests", async () => {
  let poolRequested = false;
  const handler = createListingsHandler({ getDatabase: () => { poolRequested = true; return null; } });
  const res = responseRecorder();
  await handler({ method: "POST", query: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "GET");
  assert.equal(poolRequested, false);
});

test("endpoint fails closed when database is not configured", async () => {
  const handler = createListingsHandler({ getDatabase: () => null });
  const res = responseRecorder();
  await handler({ method: "GET", query: {} }, res);
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /temporarily unavailable/);
});

test("endpoint returns active listing results and converts kobo to naira", async () => {
  let received;
  const handler = createListingsHandler({ getDatabase: () => ({
    async query(text, values) {
      received = { text, values };
      return { rowCount: 1, rows: [{ id: "item-1", title: "Desk", price_kobo: "1250000" }] };
    },
  }) });
  const res = responseRecorder();
  await handler({ method: "GET", query: { city: "Benin City" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.items[0].price_naira, 12500);
  assert.match(received.text, /l\.city = \$1/);
  assert.deepEqual(received.values, ["Benin City", 24, 0]);
  assert.match(res.headers["Cache-Control"], /s-maxage=30/);
});

test("endpoint does not expose database errors", async () => {
  const handler = createListingsHandler({ getDatabase: () => ({
    async query() { throw new Error("private database detail"); },
  }) });
  const res = responseRecorder();
  await handler({ method: "GET", query: {} }, res);
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /private database detail/);
});
