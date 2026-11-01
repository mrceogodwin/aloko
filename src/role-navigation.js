const ACCOUNT_TYPE_ROLES = Object.freeze({
  buyer: "buyer",
  individual: "seller",
  reseller: "seller",
  business: "business",
  bulk_distributor: "business",
  decluttering_provider: "service_provider"
});

const DASHBOARDS = Object.freeze({
  buyer: { label: "My Aloko", screen: "buyer-dashboard" },
  seller: { label: "Seller Studio", screen: "seller" },
  business: { label: "Business Hub", screen: "business-dashboard" },
  service_provider: { label: "Service Workspace", screen: "services" },
  moderator: { label: "Moderator Desk", screen: "moderator-desk" },
  admin: { label: "Aloko Control Centre", screen: "account" }
});

export function resolveAlokoRole(profile = {}) {
  const staffRole = profile.role === "admin" || profile.role === "moderator" ? profile.role : null;
  return staffRole || ACCOUNT_TYPE_ROLES[profile.account_type] || "buyer";
}

export function getAlokoDashboard(profile = {}) {
  const role = resolveAlokoRole(profile);
  return { role, ...DASHBOARDS[role] };
}

export function getAlokoMenuItems(profile = {}) {
  const role = resolveAlokoRole(profile);
  const items = [
    { id: "home", label: "Home", screen: "home", group: "main" },
    { id: "dashboard", label: DASHBOARDS[role].label, screen: DASHBOARDS[role].screen, group: "main" },
    { id: "saved", label: "Saved items", screen: "saved", group: "main" },
    { id: "inbox", label: "Messages", screen: "inbox", group: "main" },
    { id: "account", label: "My profile", screen: "account", group: "account" },
    { id: "preferences", label: "Settings", screen: "account", group: "account" },
    { id: "help", label: "Help & support", screen: "account", group: "account" }
  ];

  if (role === "buyer") {
    items.splice(4, 0, { id: "become-seller", label: "Become a seller", screen: "seller-onboarding", group: "growth" });
    items.splice(5, 0, { id: "services", label: "Decluttering services", screen: "services", group: "main" });
  } else if (role === "seller" || role === "business") {
    items.splice(4, 0, { id: "services", label: "Decluttering services", screen: "services", group: "main" });
  } else if (role === "service_provider") {
    items.splice(4, 0, { id: "services", label: "Service requests", screen: "services", group: "main" });
    items.splice(5, 0, { id: "providers", label: "Provider directory", screen: "providers", group: "main" });
  } else if (role === "moderator") {
    items.splice(4, 0, { id: "moderation-queue", label: "Listing moderation", screen: "moderator-desk", group: "staff" });
    items.splice(5, 0, { id: "seller-review-queue", label: "Seller application queue", screen: "admin-verification", group: "staff" });
  } else if (role === "admin") {
    items.splice(4, 0, { id: "seller-review", label: "Seller applications", screen: "admin-verification", group: "staff" });
    items.splice(5, 0, { id: "provider-review", label: "Provider applications", screen: "admin-service-providers", group: "staff" });
  }

  return items;
}
