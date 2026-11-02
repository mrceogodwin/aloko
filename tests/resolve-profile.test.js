import test from "node:test";
import assert from "node:assert/strict";
import { roleFromAccountType, resolveProfile, ensureProfile } from "../api/_lib/resolve-profile.js";

test("roleFromAccountType maps marketplace account types", () => {
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
  assert.equal(await resolveProfile("11111111-1111-4111-8111-111111111111", db), null);
});

test("resolveProfile returns derived marketplace role and suspension state", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const db = {
    async query(sql, values) {
      assert.equal(values[0], id);
      if (/staff_memberships/.test(sql)) return { rows: [] };
      return { rows: [{ id, account_type: "reseller", is_suspended: false, display_name: "Ada" }] };
    },
  };
  assert.deepEqual(await resolveProfile(id, db), {
    id, role: "seller", suspended: false, account_type: "reseller", display_name: "Ada",
  });
});

test("resolveProfile grants moderator only from an active staff membership lookup", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const db = {
    async query(sql, values) {
      assert.equal(values[0], id);
      if (/staff_memberships/.test(sql)) return { rows: [{ role: "moderator" }] };
      return { rows: [{ id, account_type: "buyer", is_suspended: false, display_name: "Staff" }] };
    },
  };
  assert.equal((await resolveProfile(id, db)).role, "moderator");
});

test("resolveProfile grants admin only from an active staff membership lookup", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const db = {
    async query(sql) {
      if (/staff_memberships/.test(sql)) return { rows: [{ role: "admin" }] };
      return { rows: [{ id, account_type: "buyer", is_suspended: false, display_name: "Admin" }] };
    },
  };
  assert.equal((await resolveProfile(id, db)).role, "admin");
});

test("resolveProfile does not grant staff privileges when no membership exists", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const db = {
    async query(sql) {
      if (/staff_memberships/.test(sql)) return { rows: [] };
      return { rows: [{ id, account_type: "buyer", is_suspended: false, display_name: "Buyer" }] };
    },
  };
  assert.equal((await resolveProfile(id, db)).role, "buyer");
});

test("resolveProfile safely falls back when migration 002 is not installed", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const db = {
    async query(sql) {
      if (/staff_memberships/.test(sql)) throw new Error('relation "staff_memberships" does not exist');
      return { rows: [{ id, account_type: "business", is_suspended: false, display_name: "Biz" }] };
    },
  };
  assert.equal((await resolveProfile(id, db)).role, "business");
});

test("resolveProfile marks suspended accounts", async () => {
  const id = "22222222-2222-4222-8222-222222222222";
  const db = {
    async query(sql) {
      if (/staff_memberships/.test(sql)) return { rows: [] };
      return { rows: [{ id, account_type: "business", is_suspended: true, display_name: "Biz" }] };
    },
  };
  const profile = await resolveProfile(id, db);
  assert.equal(profile.role, "business");
  assert.equal(profile.suspended, true);
});

test("resolveProfile fails closed on profile database errors", async () => {
  const db = { async query() { throw new Error("connection lost"); } };
  assert.equal(await resolveProfile("11111111-1111-4111-8111-111111111111", db), null);
});

test("ensureProfile inserts then resolves", async () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const calls = [];
  const db = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (/INSERT/i.test(sql)) return { rows: [] };
      if (/staff_memberships/.test(sql)) return { rows: [] };
      return { rows: [{ id, account_type: "buyer", is_suspended: false, display_name: "Aloko member" }] };
    },
  };
  const profile = await ensureProfile(id, db);
  assert.equal(profile.id, id);
  assert.equal(profile.role, "buyer");
  assert.equal(calls.length, 3);
  assert.match(calls[0].sql, /'buyer'/);
  assert.match(calls[0].sql, /ON CONFLICT \(id\) DO NOTHING/);
});
