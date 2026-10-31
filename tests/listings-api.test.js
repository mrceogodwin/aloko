import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicListingsQuery } from "../api/listings-query.js";
import { createListingsHandler } from "../api/_handlers/listings.js";

test("public listing query only includes active listings", () => {
  const query = buildPublicListingsQuery({});
  assert.match(query.text, /l\.status = 'active'/);
  assert.deepEqual(query.values, [25, 0]);
});

test("search uses bound parameters and cannot inject SQL", () => {
  const query = buildPublicListingsQuery({ q: "' OR 1=1 --" });
  assert.match(query.text, /ILIKE/);
  assert.equal(query.text.includes("' OR 1=1 --"), false);
  assert.deepEqual(query.values, ["' OR 1=1 --", 25, 0]);
});

test("category and location filters are parameterized", () => {
  const query = buildPublicListingsQuery({ category: "Furniture", city: "Benin City", state: "Edo" });
  assert.match(query.text, /l\.category = \$1/);
  assert.match(query.text, /l\.city = \$2/);
  assert.match(query.text, /l\.state = \$3/);
  assert.deepEqual(query.values, ["Furniture", "Benin City", "Edo", 25, 0]);
});

test("price bounds, sort order, limit and offset are bounded", () => {
  const query = buildPublicListingsQuery({ minPrice: "20000", maxPrice: "90000", sort: "price_low", limit: "1000", offset: "-2" });
  assert.match(query.text, /l\.price_kobo ASC/);
  assert.deepEqual(query.values, [20000, 90000, 49, 0]);
});

test("invalid numeric filters are ignored and unknown sort falls back safely", () => {
  const query = buildPublicListingsQuery({ minPrice: "NaN", maxPrice: "-4", sort: "title; DROP TABLE listings" });
  assert.doesNotMatch(query.text, /DROP TABLE/);
  assert.deepEqual(query.values, [25, 0]);
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
  assert.deepEqual(received.values, ["Benin City", 25, 0]);
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

test("combined search and filters keep every placeholder aligned", () => {
  const query = buildPublicListingsQuery({
    q: "desk",
    category: "Furniture",
    city: "Benin City",
    minPrice: "0",
    maxPrice: "200000",
    sort: "price_high",
    limit: "10",
    offset: "20",
  });
  assert.match(query.text, /l\.title ILIKE '%' \|\| \$1/);
  assert.match(query.text, /l\.category = \$2/);
  assert.match(query.text, /l\.city = \$3/);
  assert.match(query.text, /COALESCE\(l\.price_kobo, 0\) >= \$4/);
  assert.match(query.text, /COALESCE\(l\.price_kobo, 0\) <= \$5/);
  assert.match(query.text, /l\.price_kobo DESC/);
  assert.deepEqual(query.values, ["desk", "Furniture", "Benin City", 0, 200000, 11, 20]);
});

test("repeated search phrase uses one bound parameter and limits its length", () => {
  const query = buildPublicListingsQuery({ q: "x".repeat(500) });
  assert.deepEqual(query.values, ["x".repeat(120), 25, 0]);
  assert.equal((query.text.match(/\$1/g) ?? []).length, 3);
});

test("endpoint returns only requested page and flags more results", async () => {
  const handler = createListingsHandler({ getDatabase: () => ({
    async query() {
      return { rowCount: 2, rows: [
        { id: "item-1", title: "Desk", price_kobo: "500000" },
        { id: "item-2", title: "Chair", price_kobo: "200000" },
      ] };
    },
  }) });
  const res = responseRecorder();
  await handler({ method: "GET", query: { limit: "1" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.has_more, true);
});

test("numeric filters reject arrays, booleans, decimals, and exponent notation", () => {
  const query = buildPublicListingsQuery({
    minPrice: ["100", "200"],
    maxPrice: true,
    limit: ["5"],
    offset: "1e3",
  });
  assert.deepEqual(query.values, [25, 0]);
  assert.equal(query.limit, 24);
});

test("numeric listing filters accept digit strings and cap oversized limits", () => {
  const query = buildPublicListingsQuery({ minPrice: "0", maxPrice: "10000", limit: "999", offset: "100001" });
  assert.deepEqual(query.values, [0, 10000, 49, 100000]);
  assert.equal(query.limit, 48);
});


test("numeric filters reject values outside JavaScript safe integer range", () => {
  const query = buildPublicListingsQuery({
    minPrice: "9007199254740992",
    maxPrice: "999999999999999999999999",
    limit: "9007199254740992",
    offset: "9007199254740992",
  });
  assert.deepEqual(query.values, [25, 0]);
  assert.equal(query.limit, 24);
});

test("unknown query parameters cannot affect SQL or pagination", () => {
  const query = buildPublicListingsQuery({
    admin: "true",
    status: "draft",
    owner_id: "attacker",
    sort: "published_at; DROP TABLE public.listings",
  });
  assert.match(query.text, /l\.status = 'active'/);
  assert.doesNotMatch(query.text, /DROP TABLE|owner_id|admin =|status = \$/);
  assert.deepEqual(query.values, [25, 0]);
});

test("invalid empty numeric filters fall back to default pagination", () => {
  const query = buildPublicListingsQuery({ minPrice: "", maxPrice: null, limit: "", offset: null });
  assert.deepEqual(query.values, [25, 0]);
  assert.equal(query.limit, 24);
});

test("text filters reject array-shaped query parameters instead of coercing them", () => {
  const query = buildPublicListingsQuery({
    q: ["desk", "chair"],
    category: ["Furniture", "Phones"],
    city: ["Benin City"],
  });
  assert.doesNotMatch(query.text, /ILIKE|l\.category =|l\.city =/);
  assert.deepEqual(query.values, [25, 0]);
});
