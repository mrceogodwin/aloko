import test from "node:test";
import assert from "node:assert/strict";
import { createProfileHandler } from "../api/_handlers/profile.js";

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("profile handler saves an allowlisted account type for the authenticated user", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  let captured;
  const handler = createProfileHandler({
    getDatabase: () => ({
      async query(sql, values) {
        captured = { sql, values };
        return { rows: [{ id: userId, display_name: "Ada", account_type: "reseller" }] };
      },
    }),
  });
  const req = {
    method: "PATCH",
    body: { account_type: "reseller" },
    auth: { user: { id: userId, role: "buyer", suspended: false } },
  };
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(captured.values, [userId, "reseller"]);
  assert.match(captured.sql, /WHERE id = \$1::uuid AND is_suspended = false/);
  assert.equal(res.body.user.account_type, "reseller");
});

test("profile handler rejects unknown account types without writing", async () => {
  let called = false;
  const handler = createProfileHandler({
    getDatabase: () => ({ async query() { called = true; return { rows: [] }; } }),
  });
  const req = {
    method: "PATCH",
    body: { account_type: "admin" },
    auth: { user: { id: "11111111-1111-4111-8111-111111111111", role: "buyer", suspended: false } },
  };
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
});

test("profile handler rejects unauthenticated requests", async () => {
  const handler = createProfileHandler({
    getDatabase: () => ({ async query() { throw new Error("should not query"); } }),
  });
  const res = response();
  await handler({ method: "PATCH", body: { account_type: "buyer" } }, res);
  assert.equal(res.statusCode, 401);
});
