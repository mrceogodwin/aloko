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

test("account onboarding accepts only POST", async () => {
  const handler = makeHandler(null);
  const res = responseRecorder();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
});

test("account onboarding rejects unsupported account types", async () => {
  const handler = makeHandler(null);
  const res = responseRecorder();
  await handler({ method: "POST", body: { account_type: "admin" } }, res);
  assert.equal(res.statusCode, 400);
});

test("account onboarding requires a verified authenticated identity", async () => {
  const handler = makeHandler({ async query() { throw new Error("must not query"); } }, {
    ok: false, status: 401, error: "Authentication required",
  });
  const res = responseRecorder();
  await handler({ method: "POST", body: { account_type: "buyer" } }, res);
  assert.equal(res.statusCode, 401);
});

test("new buyer profile can select its primary account type", async () => {
  let sqlSeen = "";
  let valuesSeen = [];
  const database = {
    async query(sql, values) {
      sqlSeen = sql;
      valuesSeen = values;
      return { rows: [{ id: userId, account_type: "individual" }] };
    },
  };
  const handler = makeHandler(database);
  const res = responseRecorder();
  await handler({ method: "POST", body: { account_type: "individual" } }, res);
  assert.match(sqlSeen, /UPDATE public\.profiles/);
  assert.match(sqlSeen, /account_type = 'buyer' OR account_type = \$1/);
  assert.deepEqual(valuesSeen, ["individual", userId]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.profile.account_type, "individual");
});

test("existing primary account type cannot be switched through account onboarding", async () => {
  const database = {
    async query(sql) {
      assert.match(sql, /account_type = 'buyer' OR account_type = \$1/);
      return { rows: [] };
    },
  };
  const handler = makeHandler(database);
  const res = responseRecorder();
  await handler({ method: "POST", body: { account_type: "business" } }, res);
  assert.equal(res.statusCode, 409);
});

test("sign-in account setup reads the existing profile without changing its type", async () => {
  let sqlSeen = "";
  const database = {
    async query(sql, values) {
      sqlSeen = sql;
      assert.deepEqual(values, [userId]);
      return { rows: [{ id: userId, account_type: "buyer" }] };
    },
  };
  const handler = makeHandler(database);
  const res = responseRecorder();
  await handler({ method: "POST", body: {} }, res);
  assert.match(sqlSeen, /^\s*SELECT/);
  assert.doesNotMatch(sqlSeen, /UPDATE public\.profiles/);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.profile.account_type, "buyer");
});
