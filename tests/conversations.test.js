import test from "node:test";
import assert from "node:assert/strict";
import { createConversationsHandler } from "../api/_handlers/conversations.js";
import { clearRateLimitBuckets } from "../api/_lib/rate-limit.js";

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const userId = "11111111-1111-4111-8111-111111111111";
const listingId = "22222222-2222-4222-8222-222222222222";
const convId = "33333333-3333-4333-8333-333333333333";

test("conversations requires authentication", async () => {
  clearRateLimitBuckets();
  const handler = createConversationsHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 401);
});

test("conversations lists threads for the signed-in user", async () => {
  clearRateLimitBuckets();
  const handler = createConversationsHandler({
    getDatabase: () => ({
      async query(sql, values) {
        assert.equal(values[0], userId);
        return {
          rows: [{
            id: convId,
            listing_id: listingId,
            buyer_id: userId,
            seller_id: "44444444-4444-4444-8444-444444444444",
            price_kobo: 250000,
            counterpart_name: "Ada",
            last_message: "Is this still available?",
          }],
        };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "GET",
    auth: { user: { id: userId, role: "buyer" } },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.items[0].role, "buyer");
  assert.equal(res.body.items[0].price_naira, 2500);
});

test("conversations opens a thread on an active listing", async () => {
  clearRateLimitBuckets();
  const handler = createConversationsHandler({
    getDatabase: () => ({
      async query() {
        return {
          rows: [{
            id: convId,
            listing_id: listingId,
            buyer_id: userId,
            seller_id: "44444444-4444-4444-8444-444444444444",
          }],
        };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST",
    body: { listing_id: listingId },
    auth: { user: { id: userId, role: "buyer" } },
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.conversation.id, convId);
});
