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
