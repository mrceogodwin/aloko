const MAX_LIMIT = 48;
const DEFAULT_LIMIT = 24;

function boundedInteger(value, fallback, min, max) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function buildPublicListingsQuery(params = {}) {
  const clauses = ["l.status = 'active'"];
  const values = [];
  const add = (sql, value) => {
    values.push(value);
    clauses.push(sql.replace("?", `$${values.length}`));
  };

  const search = String(params.q ?? "").trim().slice(0, 120);
  if (search) add("(l.title ILIKE '%' || ? || '%' OR l.description ILIKE '%' || ? || '%' OR l.category ILIKE '%' || ? || '%')", search);
  // The query above intentionally uses three references to one search term.
  if (search) {
    const last = values.pop();
    values.push(last, last, last);
    clauses[clauses.length - 1] = "(l.title ILIKE '%' || $" + (values.length - 2) + " || '%' OR l.description ILIKE '%' || $" + (values.length - 1) + " || '%' OR l.category ILIKE '%' || $" + values.length + " || '%')";
  }

  for (const [key, column] of [["category", "l.category"], ["city", "l.city"], ["state", "l.state"]]) {
    const value = String(params[key] ?? "").trim().slice(0, 80);
    if (value) add(column + " = ?", value);
  }

  const minPrice = params.minPrice === undefined || params.minPrice === "" ? null : Number(params.minPrice);
  if (minPrice !== null && Number.isSafeInteger(minPrice) && minPrice >= 0) add("COALESCE(l.price_kobo, 0) >= ?", minPrice);
  const maxPrice = params.maxPrice === undefined || params.maxPrice === "" ? null : Number(params.maxPrice);
  if (maxPrice !== null && Number.isSafeInteger(maxPrice) && maxPrice >= 0) add("COALESCE(l.price_kobo, 0) <= ?", maxPrice);

  const limit = boundedInteger(params.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = boundedInteger(params.offset, 0, 0, 100000);
  values.push(limit, offset);
  const sort = params.sort === "price_low" ? "l.price_kobo ASC NULLS FIRST, l.published_at DESC NULLS LAST"
    : params.sort === "price_high" ? "l.price_kobo DESC NULLS LAST, l.published_at DESC NULLS LAST"
    : "l.published_at DESC NULLS LAST, l.created_at DESC";

  return {
    text: `SELECT l.id, l.title, l.description, l.category, l.kind, l.condition, l.price_kobo, l.quantity, l.city, l.state, l.pickup_available, l.delivery_available, l.published_at FROM public.listings l WHERE ${clauses.join(" AND ")} ORDER BY ${sort} LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  };
}
