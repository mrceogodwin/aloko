import test from "node:test";
import assert from "node:assert/strict";
import {
  roleFromAccountType,
  resolveProfile,
  ensureProfile,
} from "../api/_lib/resolve-profile.js";

test("roleFromAccountType maps account types to application roles", () => {
  assert.equal(roleFromAccountType("buyer"), "buyer");
  assert.equal(roleFromAccountType("individual"), "seller");
  assert.equal(roleFromAccountType("reseller"), "seller");
  assert.equal(roleFromAccountType("business"), "business");
  assert.equal(roleFromAccountType("bulk_distributor"), "business");
  assert.equal(roleFromAccountType("decluttering_provider"), "service_provider");
  assert.equal(roleFromAccountType("unknown"), "buyer");
});

test("resolveProfile rejects invalid ids before querying", async () => {
  let called = false;
  const db = { async query() { called = true; return { rows: [] }; } };
  assert.equal(await resolveProfile("not-a-uuid", db), null);
  assert.equal(await resolveProfile("", db), null);
  assert.equal(await resolveProfile(null, db), null);
  assert.equal(called, false);
});

test("resolveProfile returns null when profile is missing", async () => {
  const db = { async query() { return { rows: [] }; } };
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(await resolveProfile(id, db), null);
});

test("resolveProfile returns derived role and suspension state", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const db = {
    async query(sql, values) {
      assert.equal(values[0], id);
      return {
        rows: [{
          id,
          account_type: "reseller",
          is_suspended: false,
          display_name: "Ada",
        }],
      };
    },
  };
  const profile = await resolveProfile(id, db);
  assert.deepEqual(profile, {
    id,
    role: "seller",
    suspended: false,
    account_type: "reseller",
    display_name: "Ada",
  });
});

test("resolveProfile marks suspended accounts", async () => {
  const id = "22222222-2222-4222-8222-222222222222";
  const db = {
    async query() {
      return {
        rows: [{
          id,
          account_type: "business",
          is_suspended: true,
          display_name: "Biz",
        }],
      };
    },
  };
  const profile = await resolveProfile(id, db);
  assert.equal(profile.role, "business");
  assert.equal(profile.suspended, true);
});

test("resolveProfile fails closed on database errors", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const db = { async query() { throw new Error("connection lost"); } };
  assert.equal(await resolveProfile(id, db), null);
});

test("ensureProfile inserts then resolves", async () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const calls = [];
  const db = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (/INSERT/i.test(sql)) return { rows: [] };
      return {
        rows: [{
          id,
          account_type: "buyer",
          is_suspended: false,
          display_name: "Aloko member",
        }],
      };
    },
  };
  const profile = await ensureProfile(id, db);
  assert.equal(profile.id, id);
  assert.equal(profile.role, "buyer");
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /\x27buyer\x27/);
  assert.match(calls[0].sql, /ON CONFLICT \(id\) DO NOTHING/);
});
