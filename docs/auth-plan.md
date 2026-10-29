# Aloko Authentication Integration Plan

Document date: 29 October 2026  
Status: Design + scaffold only. No production provider enabled.  
Repository HEAD at time of writing: `dd0fc651d6f5ee9599a8c6b01b215cfd712cc365`

## Goal

Wire real, trusted authentication so protected listing-write (and future) endpoints can safely derive `req.auth.user` from verified credentials. Fail closed until the provider and middleware are verified end-to-end.

## Constraints (from schema and existing code)

- `public.profiles.id` is a UUID primary key that **must match** the authentication provider user ID.
- Existing handlers call `authorize(req, allowedRoles)` from `api/_lib/authz.js` and expect:
  ```js
  req.auth.user = { id: string /* UUID */, role: string, suspended: boolean }
  ```
- Application roles: `buyer | seller | business | service_provider | moderator | admin`.
- Profile `account_type`: `individual | reseller | business | bulk_distributor | decluttering_provider`.
- Listing create/update SQL already enforces non-suspended + role/account_type consistency.
- Never trust IDs, roles or suspension state supplied by the browser, query string or request body.
- Serverless Node handlers (Vercel-compatible). JWT + JWKS verification is the natural fit.

## Recommended provider

**Primary recommendation: Neon Auth (Managed Better Auth)**

Reasons:
- Database is already the dedicated Neon project `aloko-production`.
- Identity data lives in the same Postgres (`neon_auth` schema) and branches with the database.
- Issues short-lived JWTs verifiable via public JWKS (`jose`).
- React client SDK exists; Vercel preview integration is documented.
- Aligns with the schema comment that profile IDs must match the auth provider.

**Fallback: Clerk**

Strong React DX and prebuilt UI. Requires keeping `profiles.id` synchronised with Clerk user IDs and an extra vendor. Acceptable if polished auth UI is prioritised over same-database identity.

Other options (Auth.js self-hosted, Supabase Auth) are lower priority for this stack.

**Owner action required before any live enablement:**
1. Confirm Neon Auth is acceptable (or choose Clerk).
2. Enable the provider in the correct Neon project / branch (or create the Clerk application).
3. Supply the JWKS / base URL via server-only environment variables.
4. Explicitly authorise any production configuration change.

Do not enable a provider or put secrets in the repository.

## Target architecture

```
Browser (React)
  → Neon Auth / Clerk client (login, session, JWT)
  → Authorization: Bearer <JWT> on protected API calls

Vercel serverless handler
  → extract Bearer token
  → verify signature + issuer + expiry against provider JWKS (jose)
  → sub claim must be a UUID → user.id
  → load (or bootstrap) public.profiles by that id
  → derive role + suspended only from the database record
  → set req.auth.user = { id, role, suspended }
  → existing authorize() / listing SQL continue to work unchanged
```

Public routes (`GET /api/listings`, `GET /api/health`) remain unauthenticated.

## Role and profile mapping

| Application role     | Eligible account_type values              |
|----------------------|-------------------------------------------|
| seller               | individual, reseller                      |
| business             | business, bulk_distributor                |
| service_provider     | decluttering_provider                     |
| buyer                | any (read-only marketplace access)        |
| moderator / admin    | staff only; never self-assigned           |

On first successful authentication:
- Create a `profiles` row with `id = auth.user.id`, `account_type = 'individual'`, `is_suspended = false` if one does not exist.
- Later seller/business onboarding updates `account_type` and the derived role.

Suspension is always read from `profiles.is_suspended` at request time.

## Implementation stages (ordered)

1. **Scaffold (this commit)**  
   - Document the plan.  
   - Add a pure JWT verification helper that fails closed when configuration is missing.  
   - Unit tests for the helper and continued fail-closed behaviour of protected routes.

2. **Provider selection & configuration (owner gate)**  
   - Enable Neon Auth (or Clerk) on the correct project/branch.  
   - Record the exact base URL / JWKS URL.  
   - Add server-only env vars (`NEON_AUTH_BASE_URL` or Clerk equivalents). Never `VITE_*` for secrets.

3. **Middleware adapter**  
   - `api/_lib/auth-middleware.js` (or equivalent) that populates `req.auth.user` from a verified token + profile lookup.  
   - Profile bootstrap transaction.  
   - Wire into create/update handlers without weakening existing SQL ownership checks.

4. **Frontend**  
   - Login / register / logout UI using the chosen client SDK.  
   - Attach Bearer token to protected requests.  
   - Clear empty/error/success states; no fake success messages.

5. **Regression & security tests**  
   - Unauthenticated → 401.  
   - Suspended → 403.  
   - Wrong role → 403.  
   - Cross-user listing edit → 404.  
   - Token replay / expired / wrong issuer → 401.

6. **Only after explicit owner permission**  
   - Deploy to the authorised Vercel project.  
   - Smoke-test the live login → create listing → moderation path.

## Environment variables (server-only, never commit)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Existing Neon connection (already required) |
| `NEON_AUTH_BASE_URL` (or Clerk JWKS URL) | Issuer + JWKS discovery |
| Optional: `NEON_AUTH_JWKS_URL` | Explicit JWKS if not derived |

No authentication secrets in frontend env or source control.

## Security rules that remain non-negotiable

- Fail closed when the provider is not configured or verification fails.
- Identity and role come only from verified token + database.
- Clients cannot set seller_id, status, moderation_note, or role.
- Suspended accounts cannot perform seller/business writes.
- Rate limiting and audit logging will be added before launch for sensitive actions.
- Migration `002_platform_operations.sql` stays unapplied until separately authorised.

## Current scaffold files

- `api/_lib/verify-token.js` – pure JWT verification helper (fails closed when unconfigured).
- Tests under `tests/` cover the helper and preserve existing authz/listing-create behaviour.

This plan does not claim authentication is complete. It only prepares the ground so the next owner-approved step can be small, tested and reversible.
