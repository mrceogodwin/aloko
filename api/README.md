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
