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

## `POST /api/listings-create`

Accepts listing details from an authenticated seller or business account. The handler validates the request, derives ownership only from trusted server auth context, and always creates the listing with `pending_review` status. It never accepts caller-supplied seller identity, publication status, or moderation decisions. It returns field-level validation errors for invalid input and does not expose database exceptions.

**Important:** this route requires trusted authentication middleware to set `req.auth.user` with a verified user ID, server-derived role, and suspension state. No provider/middleware is currently wired into the deployed application, so the endpoint is not launch-ready and must fail closed until that adapter exists. Unit tests inject trusted auth context directly; that does not constitute a real login system. The seller profile must already exist in `public.profiles`.

## `PATCH /api/listings-update?id=<uuid>` (also accepts PUT)

Updates a seller's own listing using the same validated listing fields as submission. Ownership is enforced in the SQL update using the trusted authenticated user ID, and the seller profile must be active and match the seller/business role. Edited listings return to `pending_review`; publication time is cleared and the moderation note is reset. A missing or non-owned listing returns the same 404 response to avoid revealing other users' listing IDs. This route requires the same real authentication middleware described above and is not launch-ready until that middleware is wired and verified.

## Environment

Configure `DATABASE_URL` in the server environment only. Never place it in a `VITE_*` variable, frontend source, browser storage, or public repository. The connection uses TLS certificate verification. Do not commit credentials to GitHub.

## Current security boundary

- The public listing route is read-only.
- The health route discloses only whether the database is configured/reachable.
- `api/_lib/authz.js` contains authorization helpers that require a trusted `req.auth.user` populated by authentication middleware. **No authentication provider/middleware is wired yet**, so these helpers do not by themselves create login sessions.
- Do not add write endpoints until trusted authentication, server-derived role checks, request validation, rate limiting, and database authorization are implemented and tested.
- Before production launch, implement row-level security or equivalent server authorization, secure image storage, payment-provider webhook verification, and audited server-only writes for credits, moderation, and account suspension.
