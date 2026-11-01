import test from "node:test";
import assert from "node:assert/strict";
import { getAlokoDashboard, getAlokoMenuItems, resolveAlokoRole } from "../src/role-navigation.js";

test("marketplace account types resolve to the intended dashboard role", () => {
  assert.equal(resolveAlokoRole({ account_type: "buyer" }), "buyer");
  assert.equal(resolveAlokoRole({ account_type: "individual" }), "seller");
  assert.equal(resolveAlokoRole({ account_type: "reseller" }), "seller");
  assert.equal(resolveAlokoRole({ account_type: "business" }), "business");
  assert.equal(resolveAlokoRole({ account_type: "bulk_distributor" }), "business");
  assert.equal(resolveAlokoRole({ account_type: "decluttering_provider" }), "service_provider");
});

test("trusted staff membership role takes precedence over marketplace account type", () => {
  assert.equal(resolveAlokoRole({ role: "moderator", account_type: "buyer" }), "moderator");
  assert.equal(resolveAlokoRole({ role: "admin", account_type: "individual" }), "admin");
  assert.equal(resolveAlokoRole({ role: "member", account_type: "business" }), "business");
});

test("dashboard labels are role-specific without exposing account switching", () => {
  assert.deepEqual(getAlokoDashboard({ account_type: "buyer" }), { role: "buyer", label: "My Aloko", screen: "account" });
  assert.equal(getAlokoDashboard({ account_type: "business" }).label, "Business Hub");
  assert.equal(getAlokoDashboard({ role: "moderator" }).label, "Moderator Desk");
  assert.equal(getAlokoDashboard({ role: "admin" }).label, "Aloko Control Centre");
});

test("buyer navigation includes seller onboarding but no account-type switcher", () => {
  const items = getAlokoMenuItems({ account_type: "buyer" });
  assert.ok(items.some(item => item.id === "become-seller" && item.screen === "seller-onboarding"));
  assert.ok(items.some(item => item.id === "dashboard" && item.label === "My Aloko"));
  assert.ok(items.every(item => !/switch account|change account type/i.test(item.label)));
});

test("seller, provider and staff menus expose only their role-appropriate entry points", () => {
  const seller = getAlokoMenuItems({ account_type: "individual" });
  const provider = getAlokoMenuItems({ account_type: "decluttering_provider" });
  const moderator = getAlokoMenuItems({ role: "moderator" });
  const admin = getAlokoMenuItems({ role: "admin" });
  assert.ok(seller.some(item => item.id === "dashboard" && item.label === "Seller Studio"));
  assert.ok(!seller.some(item => item.id === "become-seller"));
  assert.ok(provider.some(item => item.id === "services"));
  assert.ok(moderator.some(item => item.id === "seller-review-queue"));
  assert.ok(!moderator.some(item => item.id === "provider-review"));
  assert.ok(admin.some(item => item.id === "provider-review"));
});
