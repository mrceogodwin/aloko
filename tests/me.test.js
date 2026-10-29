import test from "node:test";
import assert from "node:assert/strict";
import { createMeHandler } from "../api/me.js";

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const userId = "11111111-1111-4111-8111-111111111111";

test("GET /api/me rejects unauthenticated requests", async () => {
  const handler = createMeHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 401);
});

test("GET /api/me rejects non-GET methods", async () => {
  const handler = createMeHandler({ getDatabase: () => null });
  const res = responseRecorder();
  await handler({ method: "POST", auth: { user: { id: userId, role: "seller" } } }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "GET");
});

test("GET /api/me returns the authenticated profile", async () => {
  const handler = createMeHandler({
    getDatabase: () => ({
      async query() {
        return {
          rows: [{
            id: userId,
            account_type: "individual",
            is_suspended: false,
            display_name: "Ada",
          }],
        };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "GET",
    auth: { user: { id: userId, role: "seller", suspended: false } },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.user, {
    id: userId,
    role: "seller",
    account_type: "individual",
    display_name: "Ada",
    suspended: false,
  });
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("GET /api/me denies suspended accounts", async () => {
  const handler = createMeHandler({
    getDatabase: () => ({
      async query() {
        return {
          rows: [{
            id: userId,
            account_type: "individual",
            is_suspended: true,
            display_name: "Ada",
          }],
        };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "GET",
    auth: { user: { id: userId, role: "seller", suspended: true } },
  }, res);
  assert.equal(res.statusCode, 403);
});
