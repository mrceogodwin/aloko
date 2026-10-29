import test from "node:test";
import assert from "node:assert/strict";
import { populateAuth } from "../api/_lib/populate-auth.js";

const sellerId = "11111111-1111-4111-8111-111111111111";

function dbWithProfile(overrides = {}) {
  return {
    async query(sql) {
      if (/INSERT/i.test(sql)) return { rows: [] };
      return {
        rows: [{
          id: sellerId,
          account_type: "individual",
          is_suspended: false,
          display_name: "Seller",
          ...overrides,
        }],
      };
    },
  };
}

test("populateAuth rejects requests without a verifiable token", async () => {
  const result = await populateAuth({ headers: {} }, { database: dbWithProfile() });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("populateAuth succeeds when token verifies and profile exists", async () => {
  const req = { headers: { authorization: "Bearer good.token" } };
  const result = await populateAuth(req, {
    database: dbWithProfile(),
    verifyOptions: {
      verifyFn: async () => ({ sub: sellerId, payload: {} }),
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.user, {
    id: sellerId,
    role: "seller",
    suspended: false,
  });
  assert.deepEqual(req.auth.user, result.user);
});

test("populateAuth denies suspended profiles", async () => {
  const result = await populateAuth(
    { headers: { authorization: "Bearer good.token" } },
    {
      database: dbWithProfile({ is_suspended: true }),
      verifyOptions: {
        verifyFn: async () => ({ sub: sellerId, payload: {} }),
      },
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("populateAuth returns 401 when profile is missing and bootstrap is off", async () => {
  const result = await populateAuth(
    { headers: { authorization: "Bearer good.token" } },
    {
      database: { async query() { return { rows: [] }; } },
      bootstrapProfile: false,
      verifyOptions: {
        verifyFn: async () => ({ sub: sellerId, payload: {} }),
      },
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("populateAuth can bootstrap a profile on first login", async () => {
  let inserted = false;
  const db = {
    async query(sql) {
      if (/INSERT/i.test(sql)) {
        inserted = true;
        return { rows: [] };
      }
      return {
        rows: [{
          id: sellerId,
          account_type: "individual",
          is_suspended: false,
          display_name: "Aloko member",
        }],
      };
    },
  };
  const result = await populateAuth(
    { headers: { authorization: "Bearer good.token" } },
    {
      database: db,
      bootstrapProfile: true,
      verifyOptions: {
        verifyFn: async () => ({ sub: sellerId, payload: { email: "ada@example.com" } }),
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(inserted, true);
  assert.equal(result.user.role, "seller");
});

test("populateAuth returns 503 when database is unavailable", async () => {
  const result = await populateAuth(
    { headers: { authorization: "Bearer good.token" } },
    {
      database: null,
      verifyOptions: {
        verifyFn: async () => ({ sub: sellerId, payload: {} }),
      },
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
});
