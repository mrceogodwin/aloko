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

test("health returns unavailable when database is not configured", async () => {
  const handler = createHealthHandler({ getDatabase: () => null });
  const res = responseRecorder();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.database, "not_configured");
});

test("health reports ready schema when foundation tables exist", async () => {
  const handler = createHealthHandler({
    getDatabase: () => ({
      async query(sql) {
        if (String(sql).includes("to_regclass")) {
          return { rows: [{ listings_ok: true, profiles_ok: true }] };
        }
        return { rows: [{ "?column?": 1 }] };
      },
    }),
  });
  const res = responseRecorder();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.schema, "ready");
});

test("health reports missing foundation when tables are absent", async () => {
  const handler = createHealthHandler({
    getDatabase: () => ({
      async query(sql) {
        if (String(sql).includes("to_regclass")) {
          return { rows: [{ listings_ok: false, profiles_ok: false }] };
        }
        return { rows: [{ "?column?": 1 }] };
      },
    }),
  });
  const res = responseRecorder();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.schema, "missing_foundation");
});
