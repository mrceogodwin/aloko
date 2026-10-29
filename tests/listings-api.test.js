import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicListingsQuery } from "../api/listings-query.js";

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
