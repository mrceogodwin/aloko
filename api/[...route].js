import conversations from "./_handlers/conversations.js";
import buyerPreferences from "./_handlers/buyer-preferences.js";
import accountOnboarding from "./account-onboarding.js";
import health from "./_handlers/health.js";
import listingCredits from "./_handlers/listing-credits.js";
import listingImages from "./_handlers/listing-images.js";
import listingsCreate from "./_handlers/listings-create.js";
import listingsDetail from "./_handlers/listings-detail.js";
import listingsStatus from "./_handlers/listings-status.js";
import listingsUpdate from "./_handlers/listings-update.js";
import listings from "./_handlers/listings.js";
import me from "./_handlers/me.js";
import messages from "./_handlers/messages.js";
import moderationDecide from "./_handlers/moderation-decide.js";
import moderationQueue from "./_handlers/moderation-queue.js";
import myListings from "./_handlers/my-listings.js";
import reportListing from "./_handlers/report-listing.js";
import reportQueue from "./_handlers/report-queue.js";
import reportDecide from "./_handlers/report-decide.js";
import savedListings from "./_handlers/saved-listings.js";
import savedSellers from "./_handlers/saved-sellers.js";
import sellerOnboarding from "./_handlers/seller-onboarding.js";
import sellerVerificationQueue from "./_handlers/seller-verification-queue.js";
import sellerVerificationDecide from "./_handlers/seller-verification-decide.js";
import sellerStore from "./_handlers/seller-store.js";
import serviceRequests from "./_handlers/service-requests.js";
import serviceProviders from "./_handlers/service-providers.js";
import serviceProviderReview from "./_handlers/service-provider-review.js";
import providerAvailability from "./_handlers/provider-availability.js";

const handlers = {
  "account-onboarding": accountOnboarding,
  "buyer-preferences": buyerPreferences,
  "conversations": conversations,
  "health": health,
  "listing-credits": listingCredits,
  "listing-images": listingImages,
  "listings-create": listingsCreate,
  "listings-detail": listingsDetail,
  "listings-status": listingsStatus,
  "listings-update": listingsUpdate,
  "listings": listings,
  "me": me,
  "messages": messages,
  "moderation-decide": moderationDecide,
  "moderation-queue": moderationQueue,
  "my-listings": myListings,
  "report-listing": reportListing,
  "report-queue": reportQueue,
  "report-decide": reportDecide,
  "saved-listings": savedListings,
  "saved-sellers": savedSellers,
  "seller-store": sellerStore,
  "service-requests": serviceRequests,
  "service-providers": serviceProviders,
  "service-provider-review": serviceProviderReview,
  "provider-availability": providerAvailability,
  "seller-onboarding": sellerOnboarding,
  "seller-verification-queue": sellerVerificationQueue,
  "seller-verification-decide": sellerVerificationDecide,
};

function getRoute(req) {
  const route = req.query?.route;
  if (Array.isArray(route)) return route.join("/");
  if (typeof route === "string" && route) return route;
  const host = req.headers?.host || "localhost";
  const pathname = new URL(req.url || "/", `https://${host}`).pathname;
  const prefix = "/api/";
  return pathname.startsWith(prefix) ? pathname.slice(prefix.length).replace(/\/$/, "") : "";
}

export default async function handler(req, res) {
  let route;
  try {
    route = getRoute(req);
  } catch {
    return res.status(400).json({ error: "Invalid API route" });
  }
  const selected = handlers[route];
  if (!selected) return res.status(404).json({ error: "API route not found" });
  return selected(req, res);
}
