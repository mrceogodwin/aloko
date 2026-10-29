# Aloko API (current)

Serverless handlers for a Vercel-compatible runtime. Deployment remains restricted until owner authorization.

## Public

| Route | Purpose |
| --- | --- |
| `GET /api/health` | DB connectivity check |
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

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL |
| `NEON_AUTH_BASE_URL` / `NEON_AUTH_JWKS_URL` | Auth issuer (optional until enabled) |

Protected routes stay locked until a real auth provider is configured. Do not treat write endpoints as launch-ready without end-to-end login verification.
