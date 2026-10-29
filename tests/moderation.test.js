import test from "node:test";
import assert from "node:assert/strict";
import { createModerationQueueHandler } from "../api/moderation-queue.js";
import { createModerationDecideHandler } from "../api/moderation-decide.js";

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const moderatorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const listingId = "22222222-2222-4222-8222-222222222222";

test("moderation queue rejects non-staff", async () => {
  const handler = createModerationQueueHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({
    method: "GET",
    auth: { user: { id: moderatorId, role: "seller" } },
  }, res);
  assert.equal(res.statusCode, 403);
});

test("moderation queue returns pending listings for moderators", async () => {
  const handler = createModerationQueueHandler({
    getDatabase: () => ({
      async query(sql) {
        assert.match(sql, /pending_review/);
        return {
          rows: [{
            id: listingId,
            title: "Desk",
            price_kobo: 50000,
            status: "pending_review",
          }],
        };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "GET",
    auth: { user: { id: moderatorId, role: "moderator" } },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.items[0].price_naira, 500);
});

test("moderation decide requires approve or reject", async () => {
  const handler = createModerationDecideHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST",
    body: { listing_id: listingId, decision: "maybe" },
    auth: { user: { id: moderatorId, role: "admin" } },
  }, res);
  assert.equal(res.statusCode, 400);
});

test("moderation decide rejects without a reason", async () => {
  const handler = createModerationDecideHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST",
    body: { listing_id: listingId, decision: "reject", reason: "no" },
    auth: { user: { id: moderatorId, role: "moderator" } },
  }, res);
  assert.equal(res.statusCode, 400);
});

test("moderation approve updates pending listing only", async () => {
  const calls = [];
  const handler = createModerationDecideHandler({
    getDatabase: () => ({
      async query(sql, values) {
        calls.push({ sql, values });
        if (/UPDATE public\.listings/i.test(sql)) {
          return { rows: [{ id: listingId, status: "active" }] };
        }
        return { rows: [] };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST",
    body: { listing_id: listingId, decision: "approve" },
    auth: { user: { id: moderatorId, role: "admin" } },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.item.status, "active");
  assert.match(calls[0].sql, /pending_review/);
  assert.match(calls[1].sql, /audit_logs/);
});

test("moderation decide returns 404 when listing is not pending", async () => {
  const handler = createModerationDecideHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST",
    body: { listing_id: listingId, decision: "approve" },
    auth: { user: { id: moderatorId, role: "moderator" } },
  }, res);
  assert.equal(res.statusCode, 404);
});
