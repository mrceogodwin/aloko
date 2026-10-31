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
