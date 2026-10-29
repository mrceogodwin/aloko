# Aloko

Aloko is a mobile-first Nigerian reuse marketplace: **Sell it. Give it. Pass it on.**

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
npm test
npm run build
```

The active frontend is React + Vite in `src/`. The original static homepage is retained in `legacy-homepage.html` for reference.

## Current implementation

- Responsive marketplace homepage with search, category filters, giveaway/service sections, local saved-item state, and a locally stored listing draft.
- The homepage requests live inventory from `GET /api/listings`; it no longer substitutes invented sample products when the API returns no listings. An empty marketplace is therefore expected until approved listings exist in the database.
- Read-only `GET /api/listings` and `GET /api/health` handlers use a server-side PostgreSQL connection. See [API documentation](api/README.md).
- Server-side listing validation, protected listing create/update handlers, and ownership checks (CI-tested). These still require a real auth provider before they are launch-ready.
- Auth groundwork: fail-closed JWT verification helper, profile resolution, and auth population helpers. See [docs/auth-plan.md](docs/auth-plan.md).
- Search/query helpers and input validation have automated Node tests.
- The core marketplace schema is applied to the dedicated Neon database. It contains profiles, listings, listing images, saved listings, conversations, messages, listing-credit accounts, platform payments, credit ledger, promotions, reports, audit logs, and decluttering service requests.
- The original HTML homepage remains available as a design/reference artifact.

## Not connected yet

- Live authentication provider (Neon Auth or Clerk) and production middleware wiring.
- Frontend login/register UI and Bearer-token attachment on protected requests.
- Account-backed saved items, conversations, service requests, and seller dashboards.
- Image upload/storage and serving listing images from storage keys.
- Moderation/admin workflows, payment-provider checkout/webhooks, listing-credit purchases and deductions, and promotion activation.
- Database row-level security or equivalent enforced policies for application access.

The listing draft and saved items are browser-local conveniences, not persisted account data. The sell form does not publish listings or upload photos. Public listing reads only return active database listings joined to seller profiles. Do not enter real customer data until authentication, server-side authorization, storage, and write endpoints are implemented and tested.

## Schema and launch boundaries

`database/migrations/001_marketplace_foundation.sql` is applied to the dedicated Aloko production database. `database/migrations/002_platform_operations.sql` remains unapplied on production and must be reviewed and explicitly approved before it is run. CI may apply both migrations to a disposable Postgres service only for validation.

At launch, buyers arrange item purchases directly with sellers (for example, bank transfer, cash, or seller contact). Aloko listing-credit and promotion fees are separate platform payments; item checkout or escrow is not part of the current design. Decluttering service payment arrangements are also separate unless a later product decision changes this.

## Next implementation sequence

1. Choose and enable an authentication provider (Neon Auth recommended) with trusted server-side identity.
2. Turn on real JWT verification (`jose` + JWKS) and wire `populateAuth` into protected handlers.
3. Add frontend login/register and attach Bearer tokens to protected API calls.
4. Add private/public image storage and a validated upload flow.
5. Implement saved-item sync, messaging, service requests, moderation, and role-specific workspaces.
6. Implement payment verification, credit ledger writes, promotions, audit trails, and end-to-end tests.
7. Deploy to Vercel only after explicit permission, then verify the actual deployment and environment configuration.
