/**
 * Thin browser client for Aloko APIs.
 * Auth is optional until a real provider is wired; when no token is present,
 * protected calls fail closed with a clear status.
 */

function authHeaders() {
  try {
    const token = window.localStorage.getItem("aloko:access-token");
    if (token && typeof token === "string" && token.length > 20) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {
    // ignore storage errors
  }
  return {};
}

async function request(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...authHeaders(),
    ...(options.headers || {}),
  };
  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { ok: response.ok, status: response.status, data };
}

export function hasAccessToken() {
  try {
    const token = window.localStorage.getItem("aloko:access-token");
    return Boolean(token && token.length > 20);
  } catch {
    return false;
  }
}

export function openConversation(listingId) {
  return request("/api/conversations", {
    method: "POST",
    body: { listing_id: listingId },
  });
}

export function listConversations() {
  return request("/api/conversations");
}

export function listMessages(conversationId) {
  return request(`/api/messages?conversation_id=${encodeURIComponent(conversationId)}`);
}

export function sendMessage(conversationId, body) {
  return request("/api/messages", {
    method: "POST",
    body: { conversation_id: conversationId, body },
  });
}

export function fetchMyListings() {
  return request("/api/my-listings");
}

export function setListingStatus(listingId, action) {
  return request("/api/listings-status", {
    method: "POST",
    body: { listing_id: listingId, action },
  });
}

export function reportListing(listingId, reason, details) {
  return request("/api/report-listing", {
    method: "POST",
    body: { listing_id: listingId, reason, details },
  });
}

export function claimIntroductoryCredits() {
  return request("/api/listing-credits", {
    method: "POST",
    body: { action: "claim_introductory" },
  });
}


export function createListing(listing) {
  return request("/api/listings-create", {
    method: "POST",
    body: listing,
  });
}


export function listSavedListings() {
  return request("/api/saved-listings");
}

export function saveListing(listingId) {
  return request("/api/saved-listings", { method: "POST", body: { listing_id: listingId } });
}

export function unsaveListing(listingId) {
  return request("/api/saved-listings", { method: "DELETE", body: { listing_id: listingId } });
}

export function getMarketplaceProfile() {
  return request("/api/me");
}

export function getSellerStore(sellerId) {
  return request(`/api/seller-store?seller_id=${encodeURIComponent(sellerId)}`);
}

 
export function getBuyerPreferences() {
  return request("/api/buyer-preferences");
}

export function saveBuyerPreferences(preferences) {
  return request("/api/buyer-preferences", { method: "PUT", body: preferences });
}

export function listFollowedSellers() {
  return request("/api/saved-sellers");
}

export function followSeller(sellerId) {
  return request("/api/saved-sellers", { method: "POST", body: { seller_id: sellerId } });
}

export function unfollowSeller(sellerId) {
  return request("/api/saved-sellers", { method: "DELETE", body: { seller_id: sellerId } });
}

export function getSellerOnboarding() {
  return request("/api/seller-onboarding");
}

export function submitSellerOnboarding(details) {
  return request("/api/seller-onboarding", { method: "POST", body: details });
}

export function listSellerVerificationApplications() {
  return request("/api/seller-verification-queue");
}

export function decideSellerVerification(applicationId, decision, note = "") {
  return request("/api/seller-verification-decide", {
    method: "POST",
    body: { application_id: applicationId, decision, note },
  });
}

export function createServiceRequest(details) {
  return request("/api/service-requests", { method: "POST", body: details });
}

export function listMyServiceRequests() {
  return request("/api/service-requests");
}

export function listServiceProviders(filters = {}) {
  const params = new URLSearchParams();
  if (filters.service_type) params.set("service_type", filters.service_type);
  if (filters.state) params.set("state", filters.state);
  if (filters.city) params.set("city", filters.city);
  return request(`/api/service-providers?${params.toString()}`);
}

export function getMyServiceProviderProfile() {
  return request("/api/service-providers?mode=mine");
}

export function submitServiceProviderProfile(details) {
  return request("/api/service-providers", { method: "POST", body: details });
}

export function listServiceProviderApplications() {
  return request("/api/service-provider-review");
}

export function reviewServiceProvider(provider_id, decision, note = "") {
  return request("/api/service-provider-review", { method: "POST", body: { provider_id, decision, note } });
}

export function updateServiceRequest(request_id, action, amount_naira, extra = {}) {
  return request("/api/service-requests", {
    method: "PATCH",
    body: { request_id, action, ...(amount_naira == null ? {} : { amount_naira }), ...extra },
  });
}

export function getProviderAvailability() {
  return request("/api/provider-availability");
}
export function saveProviderAvailability(availability, timezone = "Africa/Lagos") {
  return request("/api/provider-availability", { method: "PUT", body: { availability, timezone } });
}

export function saveProviderAvailabilityException(exception) {
  return request("/api/provider-availability", { method: "POST", body: exception });
}
export function deleteProviderAvailabilityException(id) {
  return request("/api/provider-availability", { method: "DELETE", body: { id } });
}


export function getAccountOnboarding() {
  return request("/api/account-onboarding", { method: "GET" });
}

export function updateAccountType(accountType) {
  return request("/api/account-onboarding", {
    method: "POST",
    body: { account_type: accountType },
  });
}
