import test from "node:test";
import assert from "node:assert/strict";
import { createListingImagesHandler } from "../api/_handlers/listing-images.js";
import { clearRateLimitBuckets } from "../api/_lib/rate-limit.js";

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const sellerId = "11111111-1111-4111-8111-111111111111";
const listingId = "22222222-2222-4222-8222-222222222222";

test("listing-images requires seller auth", async () => {
  clearRateLimitBuckets();
  const handler = createListingImagesHandler({
    getDatabase: () => ({ async query() { return { rows: [] }; } }),
  });
  const res = responseRecorder();
  await handler({ method: "GET", query: { listing_id: listingId }, headers: {} }, res);
  assert.equal(res.statusCode, 401);
});

test("listing-images registers a storage key on an owned listing", async () => {
  clearRateLimitBuckets();
  let step = 0;
  const handler = createListingImagesHandler({
    getDatabase: () => ({
      async query(sql, values) {
        step += 1;
        if (step === 1) return { rows: [{ id: listingId }] };
        if (step === 2) return { rows: [{ n: 1 }] };
        assert.equal(values[1], "sellers/abc/phone-1.jpg");
        return {
          rows: [{
            id: "33333333-3333-4333-8333-333333333333",
            listing_id: listingId,
            storage_key: values[1],
            sort_order: 0,
          }],
        };
      },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST",
    body: { listing_id: listingId, storage_key: "sellers/abc/phone-1.jpg", alt_text: "Front" },
    auth: { user: { id: sellerId, role: "seller" } },
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.image.storage_key, "sellers/abc/phone-1.jpg");
});

test("listing-images rejects unsafe storage keys", async () => {
  clearRateLimitBuckets();
  const handler = createListingImagesHandler({
    getDatabase: () => ({
      async query() { return { rows: [{ id: listingId }] }; },
    }),
  });
  const res = responseRecorder();
  await handler({
    method: "POST",
    body: { listing_id: listingId, storage_key: "../etc/passwd" },
    auth: { user: { id: sellerId, role: "seller" } },
  }, res);
  assert.equal(res.statusCode, 400);
});
