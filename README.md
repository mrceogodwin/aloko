# Aloko

Aloko is a mobile-first Nigerian reuse marketplace: **Sell it. Give it. Pass it on.**

## Frontend
The project uses React and Vite. The original static HTML homepage is preserved in `legacy-homepage.html` as a reference. The active homepage is served by the React application in `src/`.

### Run locally
Requires Node.js 20 or newer.

```bash
npm install
npm run dev
npm run build
```

## Current status — not production-ready
- React/Vite frontend foundation with responsive marketplace homepage.
- Search, category filtering, and saved-item interactions currently use local demo state only.
- Listing cards are illustrative examples, not live marketplace inventory.
- Login, registration, database persistence, photo uploads, seller/buyer dashboards, messaging, moderation, listing credits, and payment verification are not yet connected.
- `database/migrations/001_marketplace_foundation.sql` is a provider-neutral PostgreSQL schema draft only. It has **not** been applied to a database; authentication integration, row-level security/server authorization, and migration testing are still required.
- At launch, buyers contact sellers directly for item purchases. Aloko listing-credit and promotion payments are separate platform fees.
- Do not enter real customer data until authentication, server-side authorization, storage, and database are implemented and tested.

## Planned implementation order
1. Establish and verify the React/Vite production build and deployment.
2. Connect managed database, authentication, and secure image storage.
3. Implement listings, search, profiles, enquiries, and moderation with server-side access control.
4. Build buyer, seller, moderator, and super-admin dashboards.
5. Implement verified listing-credit and promotion payments, audit logs, and launch testing.
