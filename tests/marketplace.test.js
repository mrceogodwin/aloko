import test from "node:test";
import assert from "node:assert/strict";
import { matchesListingQuery, parseListingPrice, sortListings, validateListingDraft } from "../src/marketplace.js";

const listings = [
  { id: 1, title: "Desk lamp", description: "Warm LED reading light", place: "Lagos", category: "Home & Living", condition: "Like new", price: "₦9,000" },
  { id: 2, title: "Books", description: "Novel collection", place: "Benin City", category: "Free items", condition: "Good", price: "Free" },
  { id: 3, title: "Headphones", description: "Wireless, long battery life", place: "Abuja", category: "Phones & Tech", condition: "Good", price: "₦22,000" }
];

test("search trims whitespace and matches title case-insensitively", () => {
  assert.equal(matchesListingQuery(listings[0], "  DESK LAMP "), true);
});
test("search matches descriptions, location, condition, category and price", () => {
  assert.equal(matchesListingQuery(listings[0], "reading light"), true);
  assert.equal(matchesListingQuery(listings[0], "lagos"), true);
  assert.equal(matchesListingQuery(listings[0], "like new"), true);
  assert.equal(matchesListingQuery(listings[1], "free items"), true);
  assert.equal(matchesListingQuery(listings[2], "22000"), true);
});
test("empty search matches every listing and missing values are safe", () => {
  assert.equal(matchesListingQuery(listings[0], "   "), true);
  assert.equal(matchesListingQuery({ title: "Untitled" }, "anything"), false);
});
test("free items sort before paid listings and prices sort numerically", () => {
  assert.deepEqual(sortListings(listings, "price-low").map(item => item.id), [2, 1, 3]);
  assert.deepEqual(sortListings(listings, "price-high").map(item => item.id), [3, 1, 2]);
});
test("recent sorting preserves the original listing order without mutating input", () => {
  const shuffled = [listings[2], listings[0], listings[1]];
  assert.deepEqual(sortListings(shuffled, "recent", listings).map(item => item.id), [1, 2, 3]);
  assert.deepEqual(shuffled.map(item => item.id), [3, 1, 2]);
});
test("unknown price labels are placed after known prices in low-to-high sorting", () => {
  assert.equal(parseListingPrice("Free"), 0);
  assert.equal(parseListingPrice("₦1,500"), 1500);
  assert.equal(parseListingPrice("Negotiable"), Number.POSITIVE_INFINITY);
});

const validDraft = {
  title: "Wooden study desk", kind: "sale", price: "18000", category: "Home & Living",
  condition: "Good", quantity: "2", fulfillment: "pickup", place: "Benin City",
  description: "Used desk in good condition, collection arranged with seller."
};

test("valid sale draft passes business validation", () => {
  assert.deepEqual(validateListingDraft(validDraft), { valid: true, errors: {} });
});
test("giveaway draft must be free and use the Free items category", () => {
  const giveaway = { ...validDraft, kind: "giveaway", price: "0", category: "Free items" };
  assert.equal(validateListingDraft(giveaway).valid, true);
  assert.equal(validateListingDraft({ ...giveaway, price: "500" }).errors.price, "Giveaway listings must be free.");
  assert.ok(validateListingDraft({ ...giveaway, category: "Fashion" }).errors.category);
});
test("rejects invalid prices, quantities and short text", () => {
  const result = validateListingDraft({ ...validDraft, price: "0", quantity: "1.5", title: "Bed", description: "short" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.price);
  assert.ok(result.errors.quantity);
  assert.ok(result.errors.title);
  assert.ok(result.errors.description);
});
test("rejects unsupported listing options and missing location", () => {
  const result = validateListingDraft({ ...validDraft, kind: "admin", condition: "Unknown", fulfillment: "drone", place: " " });
  assert.equal(result.valid, false);
  assert.ok(result.errors.kind);
  assert.ok(result.errors.condition);
  assert.ok(result.errors.fulfillment);
  assert.ok(result.errors.place);
});
