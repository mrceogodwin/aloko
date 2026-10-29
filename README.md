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
- Search/query helpers and input validation have automated Node tests.
- The core marketplace schema is applied to the dedicated Neon database. It contains profiles, listings, listing images, saved listings, conversations, messages, listing-credit accounts, platform payments, credit ledger, promotions, reports, audit logs, and decluttering service requests.
- The original HTML homepage remains available as a design/reference artifact.

## Not connected yet

- Authentication/session provider and trusted identity middleware.
- Authenticated listing creation/editing/publishing, account-backed saved items, conversations, service requests, and seller dashboards.
- Image upload/storage and serving listing images from storage keys.
- Moderation/admin workflows, payment-provider checkout/webhooks, listing-credit purchases and deductions, and promotion activation.
- Database row-level security or equivalent enforced policies for application access.

The listing draft and saved items are browser-local conveniences, not persisted account data. The sell form does not publish listings or upload photos. Public listing reads only return active database listings joined to seller profiles. Do not enter real customer data until authentication, server-side authorization, storage, and write endpoints are implemented and tested.

## Schema and launch boundaries

`database/migrations/001_marketplace_foundation.sql` is applied to the dedicated Aloko production database. `database/migrations/002_platform_operations.sql` remains unapplied and must be reviewed and explicitly approved before it is run.

At launch, buyers arrange item purchases directly with sellers (for example, bank transfer, cash, or seller contact). Aloko listing-credit and promotion fees are separate platform payments; item checkout or escrow is not part of the current design. Decluttering service payment arrangements are also separate unless a later product decision changes this.

## Next implementation sequence

1. Choose and wire an authentication provider with trusted server-side identity.
2. Add protected profile and listing-write APIs with server validation, ownership checks, and database authorization.
3. Add private/public image storage and a validated upload flow.
4. Implement saved-item sync, messaging, service requests, moderation, and role-specific workspaces.
5. Implement payment verification, credit ledger writes, promotions, audit trails, and end-to-end tests.
6. Deploy to Vercel only after explicit permission, then verify the actual deployment and environment configuration.
