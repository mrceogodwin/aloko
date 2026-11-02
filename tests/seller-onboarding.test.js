import test from "node:test";
import assert from "node:assert/strict";
import { createSellerOnboardingHandler } from "../api/_handlers/seller-onboarding.js";
import { clearRateLimitBuckets } from "../api/_lib/rate-limit.js";

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const buyerId = "11111111-1111-4111-8111-111111111111";
const auth = { user: { id: buyerId, role: "buyer" } };
const individual = {
  account_kind: "individual_seller",
  store_name: "Ada Finds",
  store_slug: "ada-finds",
  legal_name: "Ada Example",
  contact_phone: "+2348012345678",
  category: "Fashion",
  city: "Ikeja",
  state: "Lagos",
  pickup_available: true,
  delivery_available: true,
};

test("seller onboarding requires authentication", async () => {
  clearRateLimitBuckets();
  const handler = createSellerOnboardingHandler({ getDatabase: () => null });
  const res = responseRecorder();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 401);
});

test("seller onboarding returns only the signed-in user's store", async () => {
  clearRateLimitBuckets();
  const handler = createSellerOnboardingHandler({
    getDatabase: () => ({ async query(sql, values) {
      assert.match(sql, /WHERE s.user_id = \$1::uuid/);
      assert.equal(values[0], buyerId);
      return { rows: [{ store_slug: "ada-finds", verification_status: "pending" }] };
    } }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", auth }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.onboarding.store_slug, "ada-finds");
});

test("individual seller application is submitted without CAC fields", async () => {
  clearRateLimitBuckets();
  const handler = createSellerOnboardingHandler({
    getDatabase: () => ({ async query(sql, values) {
      assert.match(sql, /UPDATE public\.profiles/);
      assert.match(sql, /INSERT INTO public\.verification_applications/);
      assert.equal(values[0], buyerId);
      assert.equal(values[1], "individual");
      assert.equal(values[3], "individual_seller");
      assert.equal(values[8], null);
      assert.equal(values[15], "Ada Example");
      return { rows: [{ application_id: "33333333-3333-4333-8333-333333333333", application_status: "pending", submitted_at: "2026-10-31T10:00:00Z" }] };
    } }),
  });
  const res = responseRecorder();
  await handler({ method: "POST", auth, body: individual }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.application.status, "pending");
  assert.match(res.body.message, /remains locked until verification is approved/);
});

test("business seller requires business name and CAC registration number", async () => {
  clearRateLimitBuckets();
  const handler = createSellerOnboardingHandler({
    getDatabase: () => ({ async query() { throw new Error("invalid input must not reach database"); } }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST", auth,
    body: { ...individual, account_kind: "business_seller" },
  }, res);
  assert.equal(res.statusCode, 400);
});

test("individual sellers cannot submit CAC or business identity fields", async () => {
  clearRateLimitBuckets();
  const handler = createSellerOnboardingHandler({
    getDatabase: () => ({ async query() { throw new Error("invalid input must not reach database"); } }),
  });
  const res = responseRecorder();
  await handler({ method: "POST", auth, body: { ...individual, cac_registration_number: "RC123" } }, res);
  assert.equal(res.statusCode, 400);
});

test("seller onboarding rejects unsafe store slugs and invalid fulfilment", async () => {
  clearRateLimitBuckets();
  const handler = createSellerOnboardingHandler({
    getDatabase: () => ({ async query() { throw new Error("invalid input must not reach database"); } }),
  });
  const res = responseRecorder();
  await handler({ method: "POST", auth, body: { ...individual, store_slug: "../ada", pickup_available: false, delivery_available: false } }, res);
  assert.equal(res.statusCode, 400);
});

test("existing sellers cannot switch account kind through onboarding", async () => {
  clearRateLimitBuckets();
  const handler = createSellerOnboardingHandler({
    getDatabase: () => ({ async query() { throw new Error("must reject before query"); } }),
  });
  const res = responseRecorder();
  await handler({ method: "POST", auth: { user: { id: buyerId, role: "seller" } }, body: { ...individual, account_kind: "business_seller" } }, res);
  assert.equal(res.statusCode, 409);
});

test("seller onboarding supports GET and POST only", async () => {
  clearRateLimitBuckets();
  const handler = createSellerOnboardingHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({ method: "DELETE", auth }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "GET, POST");
});
