import test from "node:test";
import assert from "node:assert/strict";
import { authorize, authorizeStaff, getAuthenticatedUser } from "../api/_lib/authz.js";

test("missing or malformed trusted auth context is unauthenticated", () => {
  assert.equal(getAuthenticatedUser({ query: { userId: "admin", role: "admin" } }), null);
  assert.equal(getAuthenticatedUser({ auth: { user: { id: "", role: "buyer" } } }), null);
  assert.equal(authorize({}).status, 401);
});

test("authorization uses server-provided identity and role only", () => {
  const req = {
    query: { role: "admin" },
    body: { userId: "attacker", role: "admin" },
    auth: { user: { id: "user-1", role: "buyer" } },
  };
  assert.equal(authorize(req, ["admin"]).status, 403);
  assert.deepEqual(authorize(req, ["buyer"]), {
    ok: true,
    user: { id: "user-1", role: "buyer", suspended: false },
  });
});

test("suspended users are denied even when their role is allowed", () => {
  const result = authorize({ auth: { user: { id: "user-2", role: "admin", suspended: true } } }, ["admin"]);
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("staff authorization rejects buyers and unknown role strings", () => {
  assert.equal(authorizeStaff({ auth: { user: { id: "u1", role: "buyer" } } }).status, 403);
  assert.equal(authorizeStaff({ auth: { user: { id: "u2", role: "owner" } } }).status, 403);
});

test("staff authorization accepts moderator and admin when explicitly allowed", () => {
  assert.equal(authorizeStaff({ auth: { user: { id: "m1", role: "moderator" } } }).ok, true);
  assert.equal(authorizeStaff({ auth: { user: { id: "a1", role: "admin" } } }).ok, true);
});
