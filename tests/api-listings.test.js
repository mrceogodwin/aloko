import test from "node:test";
import assert from "node:assert/strict";
import { createListingsHandler } from "../api/_handlers/listings.js";

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

test("listings handler returns items from the database", async () => {
  const handler = createListingsHandler({
    getDatabase: () => ({
      async query() {
        return {
          rows: [{
            id: "1",
            title: "Desk",
            price_kobo: 1500000,
            city: "Lagos",
            state: "Lagos",
          }],
        };
      },
    }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", query: { limit: "10" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.items[0].price_naira, 15000);
  assert.equal(res.body.count, 1);
});

test("listings handler reports missing schema clearly", async () => {
  const handler = createListingsHandler({
    getDatabase: () => ({
      async query() {
        const err = new Error('relation "public.listings" does not exist');
        err.code = "42P01";
        throw err;
      },
    }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", query: {} }, res);
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /schema/i);
});

test("listings handler rejects non-GET methods", async () => {
  const handler = createListingsHandler({ getDatabase: () => null });
  const res = responseRecorder();
  await handler({ method: "POST" }, res);
  assert.equal(res.statusCode, 405);
});
