# Aloko API (current)

Serverless handlers for a Vercel-compatible runtime. Deployment remains restricted until owner authorization.

## Public

| Route | Purpose |
| --- | --- |
| `GET /api/health` | DB connectivity + schema readiness |
| `GET /api/listings` | Active listings with search/filter |
| `GET /api/listings-detail?id=` | Single active listing |

## Authenticated (Bearer / `req.auth.user`)

| Route | Roles | Purpose |
| --- | --- | --- |
| `GET /api/me` | any | Current profile |
| `POST /api/listings-create` | seller, business | Submit listing → `pending_review` |
| `PATCH /api/listings-update?id=` | seller, business | Edit own listing → back to review |
| `POST /api/listings-status` | seller, business | `pause` / `resume` / `mark_sold` |
| `GET /api/my-listings` | seller, business | Seller inventory |
| `GET/POST/DELETE /api/saved-listings` | any | Server-side saved items |
| `POST /api/report-listing` | any | Abuse report |
| `GET/POST /api/conversations` | any | List threads / open thread on a listing |
| `GET/POST /api/messages` | any | Read or send messages in a thread |
| `GET/POST/PATCH /api/service-requests` | any | Create enquiries, view customer/provider requests, send quotes, accept quotes, or cancel open enquiries |
| `GET /api/service-providers` | public | Browse approved providers; supports `service_type`, `state`, and `city` filters |
| `GET /api/service-providers?mode=mine` | authenticated | Read the signed-in provider's private application/profile |
| `POST /api/service-providers` | buyer, seller, business, decluttering_provider | Submit or update a provider application; edits return the profile to pending review |
| `GET/POST /api/service-provider-review` | moderator/admin (approval admin only) | Review provider applications and approve/reject profiles |

## Service provider review

- Provider profiles are private until their status is `approved` and they are accepting requests.
- Public directory responses omit phone and email contact fields.
- Provider applications use the authenticated profile ID; clients cannot choose an applicant ID.
- Updating an approved profile resets it to `pending` and disables new requests until staff review.
- `database/migrations/005_service_provider_marketplace.sql` is a draft migration and has not been applied to the production database.
- Approved providers can receive assigned enquiries and submit NGN quotes. Customers can accept a quote; acceptance does not itself confirm a calendar booking or payment.

## Staff

| Route | Roles | Purpose |
| --- | --- | --- |
| `GET /api/moderation-queue` | moderator, admin | Pending listings |
| `POST /api/moderation-decide` | moderator, admin | Approve or reject |

## Security helpers

- `api/_lib/authz.js` — role checks on trusted `req.auth.user`
- `api/_lib/verify-token.js` — jose JWKS verification (fail closed if unconfigured)
- `api/_lib/populate-auth.js` — token → profile → `req.auth.user`
- `api/_lib/rate-limit.js` — in-process rate limits (pair with edge limits at launch)
- `api/_lib/db.js` — shared pool

## Messaging rules

- Only the buyer or seller on a conversation can read or write it.
- Opening a conversation requires an **active** listing and `buyer_id <> seller_id`.
- Message body is 1–4000 characters; rate-limited.
- Reading a thread marks the other party's unread messages as read.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL |
| `NEON_AUTH_BASE_URL` / `NEON_AUTH_JWKS_URL` | Auth issuer (optional until enabled) |

Protected routes stay locked until a real auth provider is configured. Do not treat write endpoints as launch-ready without end-to-end login verification.
