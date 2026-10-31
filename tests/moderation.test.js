import test from "node:test";
import assert from "node:assert/strict";
import { createModerationQueueHandler } from "../api/_handlers/moderation-queue.js";
import { createModerationDecideHandler } from "../api/_handlers/moderation-decide.js";

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
const sellerId = "11111111-1111-4111-8111-111111111111";

test("moderation queue requires staff", async () => {
  const handler = createModerationQueueHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 401);
});

test("moderation queue lists pending items for staff", async () => {
  const handler = createModerationQueueHandler({
    getDatabase: () => ({
      async query() {
        return {
          rows: [{
            id: listingId,
            title: "Phone",
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

test("moderation approve spends credit then publishes sale listing", async () => {
  const calls = [];
  const handler = createModerationDecideHandler({
    getDatabase: () => ({
      async query(sql, values) {
        calls.push({ sql, values });
        if (/SELECT id, seller_id/i.test(sql)) {
          return { rows: [{ id: listingId, seller_id: sellerId, title: "Phone", status: "pending_review", kind: "sale" }] };
        }
        if (/listing_credit_accounts/i.test(sql) || /credit_ledger/i.test(sql)) {
          return { rows: [{ balance: 2, ledger_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", has_account: true, prior_balance: 3 }] };
        }
        if (/UPDATE public\.listings/i.test(sql)) {
          return { rows: [{ id: listingId, status: "active", seller_id: sellerId, kind: "sale" }] };
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
  assert.ok(calls.some((c) => /listing_credit_accounts|credit_ledger/i.test(c.sql)));
  assert.ok(calls.some((c) => /audit_logs/i.test(c.sql)));
});

test("moderation approve skips credit spend for giveaways", async () => {
  const calls = [];
  const handler = createModerationDecideHandler({
    getDatabase: () => ({
      async query(sql) {
        calls.push(sql);
        if (/SELECT id, seller_id/i.test(sql)) {
          return { rows: [{ id: listingId, seller_id: sellerId, title: "Free books", status: "pending_review", kind: "giveaway" }] };
        }
        if (/UPDATE public\.listings/i.test(sql)) {
          return { rows: [{ id: listingId, status: "active", kind: "giveaway" }] };
        }
        return { rows: [] };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST",
    body: { listing_id: listingId, decision: "approve" },
    auth: { user: { id: moderatorId, role: "moderator" } },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.some((sql) => /listing_credit_accounts/i.test(sql)), false);
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
