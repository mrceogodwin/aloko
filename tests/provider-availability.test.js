import test from "node:test";
import assert from "node:assert/strict";
import { createProviderAvailabilityHandler } from "../api/_handlers/provider-availability.js";
import { clearRateLimitBuckets } from "../api/_lib/rate-limit.js";

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name,value){this.headers[name]=value;},
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;},
  };
}

test("provider availability rejects unauthenticated requests before querying the database", async () => {
  clearRateLimitBuckets();
  let queried = false;
  const handler = createProviderAvailabilityHandler({
    getDatabase: () => ({ async query(){ queried = true; throw new Error("must not query"); } }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", auth: { user: { id: "11111111-1111-4111-8111-111111111111" } } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, "Authentication required");
  assert.equal(queried, false);
});

test("provider availability rejects non-approved providers", async () => {
  clearRateLimitBuckets();
  const id = "11111111-1111-4111-8111-111111111111";
  const handler = createProviderAvailabilityHandler({
    getDatabase: () => ({ async query(sql, values) {
      assert.match(sql, /service_provider_profiles/);
      assert.deepEqual(values, [id]);
      return { rows: [{ provider_id: id, status: "pending" }] };
    } }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", auth: { user: { id, role: "buyer" } } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, "Only approved service providers can manage availability");
});
