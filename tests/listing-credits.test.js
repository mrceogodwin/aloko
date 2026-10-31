import test from "node:test";
import assert from "node:assert/strict";
import { createListingCreditsHandler } from "../api/_handlers/listing-credits.js";
import { clearRateLimitBuckets } from "../api/_lib/rate-limit.js";

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const sellerId = "11111111-1111-4111-8111-111111111111";

test("listing-credits requires seller auth", async () => {
  clearRateLimitBuckets();
  const handler = createListingCreditsHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 401);
});

test("listing-credits returns balance and ledger", async () => {
  clearRateLimitBuckets();
  const handler = createListingCreditsHandler({
    getDatabase: () => ({
      async query(sql) {
        if (String(sql).includes("listing_credit_accounts")) {
          return { rows: [{ balance: 2, updated_at: new Date().toISOString() }] };
        }
        return { rows: [{ id: "1", delta: -1, reason: "listing_publish" }] };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "GET",
    auth: { user: { id: sellerId, role: "seller" } },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.balance, 2);
  assert.equal(res.body.ledger.length, 1);
});

test("listing-credits claims introductory grant once", async () => {
  clearRateLimitBuckets();
  const handler = createListingCreditsHandler({
    getDatabase: () => ({
      async query() {
        return {
          rows: [{ balance: 3, grant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", already_granted: false }],
        };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST",
    body: { action: "claim_introductory" },
    auth: { user: { id: sellerId, role: "seller" } },
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.balance, 3);
  assert.equal(res.body.already_granted, false);
});
