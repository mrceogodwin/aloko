import test from "node:test";
import assert from "node:assert/strict";
import { createSellerVerificationQueueHandler } from "../api/_handlers/seller-verification-queue.js";
import { createSellerVerificationDecideHandler } from "../api/_handlers/seller-verification-decide.js";

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
const adminId = "11111111-1111-4111-8111-111111111111";
const applicationId = "22222222-2222-4222-8222-222222222222";
const admin = { user: { id: adminId, role: "admin" } };

test("seller verification queue is restricted to staff", async () => {
  const handler = createSellerVerificationQueueHandler({ getDatabase: () => null });
  const res = responseRecorder();
  await handler({ method: "GET", auth: { user: { id: adminId, role: "buyer" } } }, res);
  assert.equal(res.statusCode, 403);
});

test("admin can list pending seller applications without receiving private document keys", async () => {
  const handler = createSellerVerificationQueueHandler({
    getDatabase: () => ({ async query(sql) {
      assert.match(sql, /verification_applications/);
      assert.match(sql, /has_identity_document/);
      assert.doesNotMatch(sql, /identity_document_key,/);
      return { rows: [{ id: applicationId, has_identity_document: true }] };
    } }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", auth: admin }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.items[0].has_identity_document, true);
});

test("seller verification decisions require admin rather than moderator access", async () => {
  const handler = createSellerVerificationDecideHandler({ getDatabase: () => null });
  const res = responseRecorder();
  await handler({
    method: "POST",
    auth: { user: { id: adminId, role: "moderator" } },
    body: { application_id: applicationId, decision: "approve" },
  }, res);
  assert.equal(res.statusCode, 403);
});

test("admin approval requires identity and business evidence before changing status", async () => {
  let sqlSeen = "";
  const handler = createSellerVerificationDecideHandler({
    getDatabase: () => ({ async query(sql) {
      sqlSeen = sql;
      return { rows: [] };
    } }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST", auth: admin,
    body: { application_id: applicationId, decision: "approve" },
  }, res);
  assert.match(sqlSeen, /identity_document_key IS NOT NULL/);
  assert.match(sqlSeen, /cardinality\(business_document_keys\) > 0/);
  assert.equal(res.statusCode, 404);
});

test("seller verification requires a review note for rejection and information requests", async () => {
  const handler = createSellerVerificationDecideHandler({
    getDatabase: () => ({ async query() { throw new Error("must not query"); } }),
  });
  for (const decision of ["reject", "needs_information"]) {
    const res = responseRecorder();
    await handler({
      method: "POST", auth: admin,
      body: { application_id: applicationId, decision },
    }, res);
    assert.equal(res.statusCode, 400);
  }
});

test("seller verification decisions reject invalid identifiers and actions", async () => {
  const handler = createSellerVerificationDecideHandler({
    getDatabase: () => ({ async query() { throw new Error("must not query"); } }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST", auth: admin,
    body: { application_id: "bad-id", decision: "approve" },
  }, res);
  assert.equal(res.statusCode, 400);
});
