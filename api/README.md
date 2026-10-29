# Aloko API (current)

These routes are serverless-handler modules intended for a Vercel-compatible runtime. They are not deployed while deployment is restricted.

## `GET /api/health`

Runs `SELECT 1` through the configured PostgreSQL connection. Returns `200` only when the database responds. Missing or unavailable configuration returns `503`. The response is not cached.

## `GET /api/listings`

Reads only listings whose status is `active`. Supported query parameters:

| Parameter | Meaning |
| --- | --- |
| `q` | Search title, description, or category (max 120 characters) |
| `category` | Exact category filter |
| `city` | Exact city filter |
| `state` | Exact state filter |
| `minPrice` | Minimum price in **kobo** |
| `maxPrice` | Maximum price in **kobo** |
| `sort` | `price_low`, `price_high`, or default recent-first |
| `limit` | 1–48; defaults to 24 |
| `offset` | 0–100000; defaults to 0 |

The response includes `price_kobo` from the database and `price_naira` as a display convenience. No buyer-to-seller checkout is implemented. Listing-credit and promotion fees are separate platform payments.

## `GET /api/me`

Returns the authenticated user's marketplace profile (`id`, `role`, `account_type`, `display_name`, `suspended`). Requires a verified Bearer token once an auth provider is configured, or an injected `req.auth.user` in tests. Uses `Cache-Control: no-store`.

## `POST /api/listings-create`

Accepts listing details from an authenticated seller or business account. The handler validates the request, derives ownership only from trusted server auth context, and always creates the listing with `pending_review` status. It never accepts caller-supplied seller identity, publication status, or moderation decisions. It returns field-level validation errors for invalid input and does not expose database exceptions.

When `req.auth.user` is not already set, the handler attempts Bearer-token population via `populateAuth` (fail closed until JWKS is configured).

## `PATCH /api/listings-update?id=<uuid>` (also accepts PUT)

Updates a seller's own listing using the same validated listing fields as submission. Ownership is enforced in the SQL update using the trusted authenticated user ID, and the seller profile must be active and match the seller/business role. Edited listings return to `pending_review`; publication time is cleared and the moderation note is reset. A missing or non-owned listing returns the same 404 response to avoid revealing other users' listing IDs.

## Auth helpers

| Module | Purpose |
| --- | --- |
| `api/_lib/authz.js` | `authorize` / `authorizeStaff` using trusted `req.auth.user` |
| `api/_lib/verify-token.js` | Bearer extraction + jose JWKS verification (null when unconfigured/invalid) |
| `api/_lib/resolve-profile.js` | Load profile by UUID, derive role from `account_type`, optional bootstrap |
| `api/_lib/populate-auth.js` | Token + profile → `req.auth.user` |
| `api/_lib/db.js` | Shared `pg` pool |

See [docs/auth-plan.md](../docs/auth-plan.md). These helpers are not a completed login system until a provider is enabled and frontend login is wired.

## Environment

Configure server-only variables. Never place secrets in `VITE_*` variables, frontend source, or the repository.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection |
| `NEON_AUTH_BASE_URL` | Auth issuer base URL (optional until provider enabled) |
| `NEON_AUTH_JWKS_URL` | Explicit JWKS URL (optional; derived from base URL when omitted) |

## Current security boundary

- Public listing and health routes are unauthenticated.
- Protected routes fail closed without a verified identity.
- No authentication provider is enabled in production yet; do not treat write endpoints as launch-ready until end-to-end login is verified.
- Before launch: rate limiting, RLS or equivalent, secure image storage, payment webhook verification, and audit logging for privileged actions.
