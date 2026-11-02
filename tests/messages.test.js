import test from "node:test";
import assert from "node:assert/strict";
import { createMessagesHandler } from "../api/_handlers/messages.js";
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
const otherId = "44444444-4444-4444-8444-444444444444";
const convId = "33333333-3333-4333-8333-333333333333";

test("messages requires authentication", async () => {
  clearRateLimitBuckets();
  const handler = createMessagesHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", query: { conversation_id: convId }, headers: {} }, res);
  assert.equal(res.statusCode, 401);
});

test("messages lists thread history for a participant", async () => {
  clearRateLimitBuckets();
  let step = 0;
  const handler = createMessagesHandler({
    getDatabase: () => ({
      async query(sql) {
        step += 1;
        if (step === 1) {
          return { rows: [{ id: convId, buyer_id: userId, seller_id: otherId }] };
        }
        if (step === 2) return { rows: [] }; // mark read
        return {
          rows: [{
            id: "55555555-5555-4555-8555-555555555555",
            conversation_id: convId,
            sender_id: otherId,
            body: "Yes, still available",
            sender_name: "Chidi",
          }],
        };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "GET",
    query: { conversation_id: convId },
    auth: { user: { id: userId, role: "buyer" } },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.items[0].body, "Yes, still available");
});

test("messages sends a body in an owned conversation", async () => {
  clearRateLimitBuckets();
  let step = 0;
  const handler = createMessagesHandler({
    getDatabase: () => ({
      async query(sql, values) {
        step += 1;
        if (step === 1) {
          return { rows: [{ id: convId, buyer_id: userId, seller_id: otherId }] };
        }
        assert.equal(values[0], convId);
        assert.equal(values[1], userId);
        assert.equal(values[2], "How much for bulk?");
        return {
          rows: [{
            id: "66666666-6666-4666-8666-666666666666",
            conversation_id: convId,
            sender_id: userId,
            body: "How much for bulk?",
          }],
        };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST",
    body: { conversation_id: convId, body: "How much for bulk?" },
    auth: { user: { id: userId, role: "buyer" } },
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.message.body, "How much for bulk?");
});

test("messages rejects empty body", async () => {
  clearRateLimitBuckets();
  const handler = createMessagesHandler({
    getDatabase: () => ({
      async query() {
        return { rows: [{ id: convId, buyer_id: userId, seller_id: otherId }] };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST",
    body: { conversation_id: convId, body: "   " },
    auth: { user: { id: userId, role: "buyer" } },
  }, res);
  assert.equal(res.statusCode, 400);
});
