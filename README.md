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

## Authentication status

- The frontend includes the Neon Auth email registration/sign-in client and Bearer-token attachment for protected API requests.
- The signup form collects the primary account type: buyer, individual seller, reseller, business, bulk distributor, or decluttering service provider.
- Verified first sign-in bootstraps a buyer profile. Account type completion is tracked by `012_account_type_onboarding_completion.sql`; users who must verify their email can complete account-type selection after their first verified sign-in.
- Server-side JWT verification uses `jose` and the configured Neon Auth issuer/JWKS. The integration is fail-closed when those settings are missing or invalid.
- Authentication is not considered production-verified until the Vercel environment variables, Neon Auth email delivery/verification settings, issuer/JWKS validation, and a real end-to-end signup/sign-in test have all been checked.

## Remaining launch blockers

- Confirm `VITE_NEON_AUTH_URL` in the Vercel frontend environment and `NEON_AUTH_BASE_URL` / `NEON_AUTH_JWKS_URL` in the server environment. Never expose server secrets through a `VITE_` variable.
- Verify email delivery, verification links, session restoration, JWT issuer/audience expectations, and protected API calls in a non-production environment.
- Complete image upload/storage and serve listing images from private/public storage keys.
- Finish moderation/admin workflows, payment-provider checkout/webhooks, listing-credit purchases and deductions, and promotion activation.
- Add and verify database row-level security or equivalent server-enforced access controls before exposing account data.
- Account-backed saved items, conversations, service requests, and seller workspaces require end-to-end verification against the target database.

The listing draft and any explicitly browser-local convenience state are not substitutes for persisted account data. Do not enter real customer data until authentication, server-side authorization, storage, and write endpoints have been verified end to end.

## Schema and launch boundaries

`database/migrations/001_marketplace_foundation.sql` is applied to the dedicated Aloko production database. `database/migrations/002_platform_operations.sql` remains unapplied on production and must be reviewed and explicitly approved before it is run. CI may apply both migrations to a disposable Postgres service only for validation.

At launch, buyers arrange item purchases directly with sellers (for example, bank transfer, cash, or seller contact). Aloko listing-credit and promotion fees are separate platform payments; item checkout or escrow is not part of the current design. Decluttering service payment arrangements are also separate unless a later product decision changes this.

## Next implementation sequence

1. Verify Neon Auth environment configuration, email delivery/verification, JWT issuer/JWKS checks, and signup/sign-in end to end in a non-production environment.
2. Apply and validate the ordered migrations on the dedicated development Neon branch only after confirming the intended branch and approval.
3. Complete private/public image storage and a validated upload/scan flow.
4. Finish moderation/admin authorization, payment verification/webhooks, credit-ledger writes, and promotion activation.
5. Verify saved-item sync, messaging, service requests, seller onboarding, and role-specific workspaces against the development database.
6. Complete security review, including database policies, rate limits, upload controls, and audit coverage.
7. Deploy to Vercel only after explicit permission, then verify the actual deployment and environment configuration.
