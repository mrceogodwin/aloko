# Aloko

Aloko is a mobile-first Nigerian reuse marketplace: **Sell it. Give it. Pass it on.**

## Frontend

The project uses React and Vite. The original static HTML homepage is preserved in `legacy-homepage.html` as a reference. The active homepage is served by the React application in `src/`.

### Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
npm test
npm run build
```

## Current status — not production-ready

- React/Vite frontend foundation with responsive marketplace homepage.
- Search, category filtering, saved-item interactions, listing preview, and listing-draft validation are currently local/demo interactions.
- Listing cards are illustrative examples, not live marketplace inventory.
- Login, registration, database-backed listing persistence, secure photo uploads, messaging, moderation workflows, live dashboards, and payment verification are not yet connected.
- The dedicated Neon database has the **core marketplace foundation migration** applied and verified. It includes profiles, listings, listing images, saved listings, conversations, messages, listing-credit accounts, platform payments, credit ledger, promotions, reports, audit logs, and decluttering service requests.
- `database/migrations/002_platform_operations.sql` remains unapplied. It adds staff membership/permission data, configurable fee settings, listing-credit packs, promotion products, and moderation audit records. It must be reviewed and applied before those operational features are connected.
- Database tables are not yet exposed through an application API. Before launch, implement authentication integration, row-level security and/or trusted server authorization, safe storage, and migration/authorization tests. Permission arrays alone are not authorization.
- At launch, buyers contact sellers directly for item purchases. Aloko listing-credit and promotion payments are separate platform fees; item checkout/escrow is not part of the current design.
- Do not enter real customer data until authentication, server-side authorization, storage, and the application API are implemented and tested.

## Planned implementation order

1. Connect authentication and define the trusted server-side identity/role model.
2. Add a protected application API for profiles, listings, saved items, conversations, and service requests.
3. Add secure image storage and enforce authorization for all reads/writes.
4. Apply and verify the operational schema, then implement moderation and the role-specific dashboards.
5. Add verified listing-credit and promotion payments, audit logs, and launch tests.
6. Deploy to Vercel only after permission is given, then verify the actual deployment and its environment configuration.
