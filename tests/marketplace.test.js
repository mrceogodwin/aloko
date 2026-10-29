import test from "node:test";
import assert from "node:assert/strict";
import { matchesListingQuery, parseListingPrice, sortListings } from "../src/marketplace.js";

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
  assert.deepEqual(sortListings(shuffled, "recent", listings).map(item => item.id), [3, 1, 2]);
  assert.deepEqual(shuffled.map(item => item.id), [3, 1, 2]);
});
test("unknown price labels are placed after known prices in low-to-high sorting", () => {
  assert.equal(parseListingPrice("Free"), 0);
  assert.equal(parseListingPrice("₦1,500"), 1500);
  assert.equal(parseListingPrice("Negotiable"), Number.POSITIVE_INFINITY);
});
