const KINDS = new Set(["sale", "giveaway", "bulk"]);
const CONDITIONS = new Set(["new", "like_new", "good", "fair", "for_parts"]);
const MAX_PRICE_KOBO = 99_999_999_900;

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/**
 * Validate untrusted listing input before any future authenticated write.
 * The caller must still derive seller_id from trusted auth and enforce
 * ownership, listing-credit rules, moderation state, and database policy.
 */
export function validateListingInput(input) {
  const errors = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: { input: "Provide listing details." } };
  }

  const title = cleanText(input.title, 121);
  const description = cleanText(input.description, 5001);
  const category = cleanText(input.category, 81);
  const city = cleanText(input.city, 81);
  const state = cleanText(input.state, 81);
  const kind = input.kind;
  const condition = input.condition;
  const quantity = input.quantity;
  const priceKobo = input.price_kobo;

  if (title.length < 4 || title.length > 120) errors.title = "Title must be 4–120 characters.";
  if (description.length < 10 || description.length > 5000) errors.description = "Description must be 10–5,000 characters.";
  if (category.length < 2 || category.length > 80) errors.category = "Category must be 2–80 characters.";
  if (!KINDS.has(kind)) errors.kind = "Choose sale, giveaway, or bulk.";
  if (condition !== null && condition !== undefined && !CONDITIONS.has(condition)) {
    errors.condition = "Choose a supported item condition.";
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
    errors.quantity = "Quantity must be a whole number from 1 to 1,000,000.";
  }
  if (kind === "giveaway") {
    if (priceKobo !== null && priceKobo !== undefined && priceKobo !== 0) {
      errors.price_kobo = "Giveaway listings must be free.";
    }
  } else if (!Number.isSafeInteger(priceKobo) || priceKobo < 1 || priceKobo > MAX_PRICE_KOBO) {
    errors.price_kobo = "Price must be a positive whole-kobo amount within the supported limit.";
  }
  if (city.length < 2 || city.length > 80) errors.city = "City must be 2–80 characters.";
  if (state.length < 2 || state.length > 80) errors.state = "State must be 2–80 characters.";

  const pickup = input.pickup_available;
  const delivery = input.delivery_available;
  if (typeof pickup !== "boolean") errors.pickup_available = "Pickup availability must be true or false.";
  if (typeof delivery !== "boolean") errors.delivery_available = "Delivery availability must be true or false.";
  if (pickup === false && delivery === false) errors.fulfillment = "Choose pickup, delivery, or both.";

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    ...(Object.keys(errors).length === 0 ? {
      value: {
        title, description, category, city, state, kind, condition: condition ?? null,
        quantity, price_kobo: kind === "giveaway" ? 0 : priceKobo,
        pickup_available: pickup, delivery_available: delivery,
      },
    } : {}),
  };
}
