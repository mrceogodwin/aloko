const MAX_LIMIT = 48;
const DEFAULT_LIMIT = 24;

function parseNonNegativeInteger(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function boundedInteger(value, fallback, min, max) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = parseNonNegativeInteger(value);
  if (parsed === null) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function validPrice(value) {
  if (value === undefined || value === null || value === "") return null;
  return parseNonNegativeInteger(value);
}

export function buildPublicListingsQuery(params = {}) {
  const clauses = ["l.status = 'active'"];
  const values = [];

  function addClause(sql, value) {
    values.push(value);
    clauses.push(sql.replace("?", `$${values.length}`));
  }

  const search = (typeof params.q === "string" ? params.q : "").trim().slice(0, 120);
  if (search) {
    values.push(search);
    const searchIndex = values.length;
    clauses.push(`(l.title ILIKE '%' || $${searchIndex} || '%' OR l.description ILIKE '%' || $${searchIndex} || '%' OR l.category ILIKE '%' || $${searchIndex} || '%')`);
  }

  for (const [key, column] of [["category", "l.category"], ["city", "l.city"], ["state", "l.state"]]) {
    const value = (typeof params[key] === "string" ? params[key] : "").trim().slice(0, 80);
    if (value) addClause(column + " = ?", value);
  }

  const minPrice = validPrice(params.minPrice);
  if (minPrice !== null) addClause("COALESCE(l.price_kobo, 0) >= ?", minPrice);

  const maxPrice = validPrice(params.maxPrice);
  if (maxPrice !== null) addClause("COALESCE(l.price_kobo, 0) <= ?", maxPrice);

  const limit = boundedInteger(params.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = boundedInteger(params.offset, 0, 0, 100000);
  // Fetch one extra row so the API can report whether another page exists.
  values.push(limit + 1, offset);

  const sort = params.sort === "price_low"
    ? "l.price_kobo ASC NULLS FIRST, l.published_at DESC NULLS LAST"
    : params.sort === "price_high"
      ? "l.price_kobo DESC NULLS LAST, l.published_at DESC NULLS LAST"
      : "l.published_at DESC NULLS LAST, l.created_at DESC";

  return {
    text: `SELECT l.id, l.title, l.description, l.category, l.kind, l.condition, l.price_kobo, l.quantity, l.city, l.state, l.pickup_available, l.delivery_available, l.published_at, p.display_name AS seller_display_name, p.avatar_url AS seller_avatar_url, p.account_type AS seller_account_type FROM public.listings l JOIN public.profiles p ON p.id = l.seller_id WHERE ${clauses.join(" AND ")} ORDER BY ${sort} LIMIT ${values.length - 1} OFFSET ${values.length}`,
    values,
    limit,
  };
}
