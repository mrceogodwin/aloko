import test from "node:test";
import assert from "node:assert/strict";
import { createHealthHandler } from "../api/health.js";

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

test("health endpoint reports missing database configuration without leaking details", async () => {
  const handler = createHealthHandler({ getDatabase: () => null });
  const res = responseRecorder();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { status: "unavailable", database: "not_configured" });
});

test("health endpoint confirms connectivity only after SELECT 1 succeeds", async () => {
  const handler = createHealthHandler({ getDatabase: () => ({ query: async (sql) => {
    assert.equal(sql, "SELECT 1");
    return { rows: [{ "?column?": 1 }] };
  } }) });
  const res = responseRecorder();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: "ok", database: "connected" });
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("health endpoint hides connection failure details", async () => {
  const handler = createHealthHandler({ getDatabase: () => ({ query: async () => {
    throw new Error("secret host and credentials");
  } }) });
  const res = responseRecorder();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(res.body), /secret|credentials/);
});

test("health endpoint rejects non-GET methods", async () => {
  const handler = createHealthHandler({ getDatabase: () => { throw new Error("must not connect"); } });
  const res = responseRecorder();
  await handler({ method: "POST" }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "GET");
});
