import test from "node:test";
import assert from "node:assert/strict";
import { createAccountOnboardingHandler } from "../api/account-onboarding.js";

const userId = "11111111-1111-4111-8111-111111111111";
const authenticated = { ok: true, user: { id: userId } };

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function makeHandler(database, auth = authenticated) {
  return createAccountOnboardingHandler({
    getDatabase: () => database,
    authenticate: async () => auth,
  });
}

test("account onboarding only accepts GET and POST", async () => {
  const handler = makeHandler(null);
  const res = responseRecorder();
  await handler({ method: "DELETE" }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "GET, POST");
});

test("account onboarding rejects unsupported account types", async () => {
  const handler = makeHandler(null);
  const res = responseRecorder();
  await handler({ method: "POST", body: { account_type: "admin" } }, res);
  assert.equal(res.statusCode, 400);
});

test("account onboarding requires a verified identity", async () => {
  const handler = makeHandler({ async query() { throw new Error("must not query"); } }, {
    ok: false, status: 401, error: "Authentication required",
  });
  const res = responseRecorder();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 401);
});

test("GET returns whether primary account onboarding is complete", async () => {
  const database = {
    async query(sql, values) {
      assert.match(sql, /account_type_selected_at IS NOT NULL AS onboarding_complete/);
      assert.deepEqual(values, [userId]);
      return { rows: [{ id: userId, account_type: "buyer", onboarding_complete: false }] };
    },
  };
  const handler = makeHandler(database);
  const res = responseRecorder();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.profile.onboarding_complete, false);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("POST lets a new buyer select a primary account type once", async () => {
  let sqlSeen = "";
  let valuesSeen = [];
  const database = {
    async query(sql, values) {
      sqlSeen = sql;
      valuesSeen = values;
      return { rows: [{ id: userId, account_type: "individual", onboarding_complete: true }] };
    },
  };
  const handler = makeHandler(database);
  const res = responseRecorder();
  await handler({ method: "POST", body: { account_type: "individual" } }, res);
  assert.match(sqlSeen, /UPDATE public\.profiles/);
  assert.match(sqlSeen, /account_type_selected_at IS NULL OR account_type = \$1/);
  assert.match(sqlSeen, /account_type = 'buyer' OR account_type = \$1/);
  assert.deepEqual(valuesSeen, ["individual", userId]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.profile.onboarding_complete, true);
});

test("POST is idempotent for the already selected account type", async () => {
  const database = {
    async query(sql, values) {
      assert.deepEqual(values, ["buyer", userId]);
      assert.match(sql, /account_type = \$1/);
      return { rows: [{ id: userId, account_type: "buyer", onboarding_complete: true }] };
    },
  };
  const handler = makeHandler(database);
  const res = responseRecorder();
  await handler({ method: "POST", body: { account_type: "buyer" } }, res);
  assert.equal(res.statusCode, 200);
});

test("POST refuses to switch an already selected primary account type", async () => {
  const database = {
    async query() {
      return { rows: [] };
    },
  };
  const handler = makeHandler(database);
  const res = responseRecorder();
  await handler({ method: "POST", body: { account_type: "business" } }, res);
  assert.equal(res.statusCode, 409);
});
