export function matchesListingQuery(listing, query) {
  const normalizedQuery = String(query ?? "").trim().toLocaleLowerCase("en");
  if (!normalizedQuery) return true;
  const searchableFields = [
    listing.title,
    listing.description,
    listing.place,
    listing.category,
    listing.condition,
    listing.price,
    typeof listing.price === "string" ? listing.price.replace(/[^0-9]/g, "") : ""
  ];
  return searchableFields
    .filter(value => value !== null && value !== undefined)
    .join(" ")
    .toLocaleLowerCase("en")
    .includes(normalizedQuery);
}

export function parseListingPrice(price) {
  if (typeof price !== "string") return Number.POSITIVE_INFINITY;
  if (price.trim().toLocaleLowerCase("en") === "free") return 0;
  const digits = price.replace(/[^0-9]/g, "");
  return digits ? Number(digits) : Number.POSITIVE_INFINITY;
}

export function sortListings(listings, sortOrder, originalListings = listings) {
  const originalPosition = new Map(originalListings.map((listing, index) => [listing.id, index]));
  return [...listings].sort((a, b) => {
    if (sortOrder === "price-low") return parseListingPrice(a.price) - parseListingPrice(b.price);
    if (sortOrder === "price-high") return parseListingPrice(b.price) - parseListingPrice(a.price);
    return (originalPosition.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (originalPosition.get(b.id) ?? Number.MAX_SAFE_INTEGER);
  });
}

export function validateListingDraft(draft) {
  const errors = {};
  const title = typeof draft.title === "string" ? draft.title.trim() : "";
  const description = typeof draft.description === "string" ? draft.description.trim() : "";
  const place = typeof draft.place === "string" ? draft.place.trim() : "";
  const quantity = Number(draft.quantity);
  const price = Number(draft.price);
  const validKinds = ["sale", "giveaway", "bulk"];
  const validConditions = ["New", "Like new", "Good", "Fair", "For parts"];
  const validCategories = ["Home & Living", "Phones & Tech", "Fashion", "Appliances", "Furniture", "Books & Hobbies", "Free items"];
  const validFulfillment = ["pickup", "delivery", "both"];

  if (title.length < 4 || title.length > 90) errors.title = "Title must be 4–90 characters.";
  if (!validKinds.includes(draft.kind)) errors.kind = "Choose a supported listing type.";
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) errors.quantity = "Quantity must be a whole number from 1 to 1,000,000.";
  if (draft.kind === "giveaway") {
    if (price !== 0 || String(draft.price).trim() === "") errors.price = "Giveaway listings must be free.";
    if (draft.category !== "Free items") errors.category = "Giveaway listings must use the Free items category.";
  } else if (!Number.isSafeInteger(price) || price < 1 || price > 999999999) {
    errors.price = "Price must be a whole naira amount greater than zero.";
  }
  if (!validConditions.includes(draft.condition)) errors.condition = "Choose a supported item condition.";
  if (!validCategories.includes(draft.category)) errors.category = "Choose a supported listing category.";
  if (!validFulfillment.includes(draft.fulfillment)) errors.fulfillment = "Choose a supported fulfilment option.";
  if (place.length < 2 || place.length > 80) errors.place = "Location must be 2–80 characters.";
  if (description.length < 10 || description.length > 1200) errors.description = "Description must be 10–1,200 characters.";
  return { valid: Object.keys(errors).length === 0, errors };
}
