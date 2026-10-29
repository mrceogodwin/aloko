import test from "node:test";
import assert from "node:assert/strict";
import { validateListingInput } from "../api/_lib/validate-listing.js";

const validListing = {
  title: "Wooden study desk",
  description: "Used desk in good condition with minor marks.",
  category: "Furniture",
  city: "Benin City",
  state: "Edo",
  kind: "sale",
  condition: "good",
  price_kobo: 1800000,
  quantity: 2,
  pickup_available: true,
  delivery_available: false,
};

test("valid listing input returns a normalized allowlisted value", () => {
  const result = validateListingInput(validListing);
  assert.equal(result.valid, true);
  assert.deepEqual(result.value, validListing);
  assert.equal("seller_id" in result.value, false);
  assert.equal("status" in result.value, false);
});

test("giveaways must be free and normalize an omitted price to zero", () => {
  const result = validateListingInput({ ...validListing, kind: "giveaway", price_kobo: null });
  assert.equal(result.valid, true);
  assert.equal(result.value.price_kobo, 0);
  assert.equal(validateListingInput({ ...validListing, kind: "giveaway", price_kobo: 100 }).valid, false);
});

test("rejects malformed objects, enum values, and numeric strings", () => {
  assert.equal(validateListingInput(null).valid, false);
  const result = validateListingInput({
    ...validListing,
    kind: "admin",
    condition: "mint",
    quantity: "2",
    price_kobo: "1800000",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.kind);
  assert.ok(result.errors.condition);
  assert.ok(result.errors.quantity);
  assert.ok(result.errors.price_kobo);
});

test("enforces schema-aligned text lengths, positive quantity, and price bounds", () => {
  const result = validateListingInput({
    ...validListing,
    title: "abc",
    description: "short",
    category: "x",
    city: "x",
    state: "",
    quantity: 0,
    price_kobo: Number.MAX_SAFE_INTEGER,
  });
  assert.equal(result.valid, false);
  for (const field of ["title", "description", "category", "city", "state", "quantity", "price_kobo"]) {
    assert.ok(result.errors[field], `expected ${field} validation error`);
  }
});

test("requires at least one supported fulfillment option", () => {
  const result = validateListingInput({ ...validListing, pickup_available: false, delivery_available: false });
  assert.equal(result.valid, false);
  assert.ok(result.errors.fulfillment);
});

test("does not trust or pass through caller-controlled identity and publication fields", () => {
  const result = validateListingInput({
    ...validListing,
    seller_id: "attacker",
    status: "active",
    published_at: "yesterday",
    moderation_note: "approved",
  });
  assert.equal(result.valid, true);
  assert.equal("seller_id" in result.value, false);
  assert.equal("status" in result.value, false);
  assert.equal("published_at" in result.value, false);
  assert.equal("moderation_note" in result.value, false);
});
