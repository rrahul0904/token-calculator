# Production Runbook

## Release topology

Production is deployed from the verified `main` commit through the existing Vercel project `token-intelligence`. Do not create a second Vercel project for release candidates.

The current gap-closure work uses one temporary PR branch, `reverse-engineering-gap-closure`. The old Wave branches are not a dependency stack and must not be resurrected or merged independently.

Preview release candidates should use a Neon validation branch and Stripe test-mode configuration. Production must use the intended Neon production branch, production WorkOS configuration, separate production secrets, and live Token Intelligence Stripe Price IDs.

## Required production configuration

Core:
- `APP_BASE_URL`
- `DATABASE_URL`
- `TOKEN_INTELLIGENCE_ENCRYPTION_KEY`
- `CRON_SECRET`

WorkOS/AuthKit:
- `WORKOS_API_KEY`
- `WORKOS_CLIENT_ID`
- `WORKOS_COOKIE_PASSWORD`
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI`
- `WORKOS_WEBHOOK_SECRET`
- `WORKOS_AUTHKIT_DOMAIN` when MCP OAuth is enabled
- `MCP_RESOURCE_URI` when MCP OAuth is enabled

Stripe:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_TEAM`

GitHub outcome attribution when enabled:
- `GITHUB_APP_ID`
- `GITHUB_PRIVATE_KEY`
- `GITHUB_WEBHOOK_SECRET`

Signed outbound alert/audit delivery when enabled:
- `TOKEN_INTELLIGENCE_WEBHOOK_SECRET`

OTLP is optional and controlled by `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_HEADERS`. Redis is optional; launch-critical rate limiting is PostgreSQL-backed.

Never place server secrets in `NEXT_PUBLIC_*` variables. Never copy Preview database, WorkOS staging, Stripe test, webhook, cookie, or encryption secrets blindly into Production.

## CI-only authenticated E2E adapter

The repository contains an explicitly gated deterministic E2E auth adapter used by GitHub Actions with a disposable PostgreSQL tenant. It requires `TOKEN_INTELLIGENCE_E2E_AUTH_ENABLED=1` plus a matching synthetic secret/header and is not a production authentication mechanism.

Production and real Preview authentication must be verified through WorkOS/AuthKit. Do not configure the E2E adapter in Vercel Production or use it to bypass a broken WorkOS setup.

## Database migration

1. Create a Neon rollback/recovery branch from the current production branch when supported.
2. Create a `release-validation` branch from the intended production baseline.
3. Point Preview `DATABASE_URL` at `release-validation`.
4. Run `npm run db:migrate`.
5. Run `npm run db:verify`.
6. Run application integration tests against the validation database.
7. Only after Preview/runtime verification, run the same migration runner against the production Neon branch.

The migration runner uses an advisory lock and stores SHA-256 checksums in `_token_intelligence_migrations`. An applied migration whose contents later change fails with `MIGRATION_CHECKSUM_MISMATCH`; fix by adding a new migration, never by rewriting applied history.

The current verifier requires all current migrations (`0000` through `0006`), the complete release table set, the API-key quota metering trigger, critical tenant-reference triggers, and a valid foreign-key inventory. A migration file existing in Git is not evidence that a deployed database has been migrated.

## Build and CI gate

The exact final candidate SHA must execute:

```bash
npm ci --no-audit --no-fund
npm run lint
npm run typecheck
npm test
npm run db:check
npm run db:migrate
npm run db:verify
TOKEN_INTELLIGENCE_INTEGRATION_TESTS=1 npm run test:integration
npm run sdk:build
npm run build
npm run test:e2e
```

GitHub Actions additionally runs a full-history secret scan, PostgreSQL 18, authenticated E2E tenant seeding, Python SDK import, CLI smoke, production-server startup, `/api/health`, desktop Chromium and mobile Chromium.

Do not report a command as passing if it did not execute on the exact candidate SHA.

## Preview gate

Deploy the exact candidate to the existing Vercel project. Preview must use:

- validation/staging PostgreSQL, not production data by default;
- WorkOS staging/Preview configuration;
- Stripe test mode only;
- a Preview-specific encryption key and webhook/cron secrets;
- Node 22.x.

Verify at minimum:

- `/`
- `/developers`
- `/openapi.json`
- `/api/health`
- protected `/app/*`
- MCP protected-resource discovery and auth behavior
- `/v1/responses`, `/v1/chat/completions`, `/v1/messages` contract behavior
- WorkOS callback and webhook
- Stripe test webhook lifecycle
- API-key one-time disclosure/rotation/revocation
- tenant isolation
- retention/privacy controls

A Vercel `READY` deployment with `database=not_configured`, auth configuration blocked, or stale source SHA does not pass this gate.

## WorkOS gate

Preview and Production must have separate/appropriate callback origins and webhook configuration. Verify a real browser sign-in round trip on Preview before merge.

For MCP OAuth, verify RFC 9728 protected-resource discovery, AuthKit issuer/JWKS, resource/audience, `mcp:tools` scope and organization membership. API-key MCP remains available for CI/service accounts.

Directory lifecycle webhooks are idempotent, least-privilege, owner-protecting and tenant-scoped. A real customer Directory connection is external configuration; deterministic integration fixtures prove the application behavior but do not prove a live IdP connection.

## Stripe gate

Preview uses only Stripe test mode. Deterministic CI verifies signed webhook lifecycle behavior without network charges, but the release Preview must still verify the configured test Checkout/webhook/portal path when billing is launch-scoped.

Production must reference dedicated live Token Intelligence products/prices. Never reuse test Price IDs in Production and never perform a real paid charge merely as a smoke test.

## Production promotion

1. Confirm CI actually executed and passed on the exact final PR head SHA.
2. Confirm the exact-sha Vercel Preview is READY and public.
3. Confirm Preview database is real, migrated and `/api/health` returns 200 against it.
4. Confirm real WorkOS Preview sign-in/callback succeeds.
5. Confirm authenticated workspace, tenant/API-key/MCP/retention/privacy gates pass.
6. Confirm Stripe test-mode billing gate if billing is release scope.
7. Confirm Production environment values are separate and prepared.
8. Confirm production Neon migration and rollback/recovery plan.
9. Merge the single validated PR into `main`.
10. Record the resulting merge/main SHA.
11. Verify Vercel deploys or promotes that exact `main` SHA.
12. Repeat production smoke tests before declaring GO.

Do not merge a stale `production-wave-*` branch merely because it once had a green CI run.

## Rollback

Before promotion record:

- final release SHA and merge SHA;
- prior known-good Vercel production deployment ID;
- new Vercel deployment ID;
- current Neon production branch and pre-release recovery branch/snapshot where available;
- migration ledger/checksums;
- Stripe live Price IDs in use;
- WorkOS callback/webhook configuration state.

If post-production smoke fails:

1. Re-promote the prior known-good Vercel production deployment.
2. If failure is database-related, use the pre-migration Neon state as the recovery reference; do not blindly reverse destructive SQL.
3. Disable newly configured webhooks/provider integrations if they cause repeated failures.
4. Record the incident and affected release SHA.

Never hot-fix production without a branch/commit and verification trail.

## Key rotation

### Token Intelligence API key
Create/rotate from the workspace. The new secret is returned once. Confirm the old secret is denied, then update the dependent service.

### Provider BYOK
Use Verify + Rotate. The new provider secret is verified before persistence; failed verification leaves the previous encrypted credential intact.

### Master encryption key
Ciphertext is versioned/bound at the credential record. A master-key rotation requires an explicit re-encryption migration. Do not replace `TOKEN_INTELLIGENCE_ENCRYPTION_KEY` without re-encrypting existing secrets.

### WorkOS/Stripe/GitHub webhook secrets
Rotate through the provider dashboard and Vercel environment with an overlap/redeploy strategy appropriate to the provider. Verify signed delivery after rotation without printing the secret.

## Stripe recovery

Webhook events are signature validated and idempotent. When delivery is interrupted, restore the endpoint and replay relevant events from Stripe. Never manually grant paid entitlements without reconciling the underlying Stripe subscription state.

## GitHub webhook recovery

GitHub deliveries are signature validated and idempotent. Re-deliver missed webhook events where possible. Outcome attribution rejects ambiguous associations; do not force-link unrelated runs merely to fill metrics.

## Provider outage

Retries are bounded. Fallback is policy-controlled and may require approval. If the policy/database state cannot be trusted, gateway enforcement must fail closed for launch-critical controls.

## Incident evidence

Capture release SHA, Vercel deployment ID, Neon branch/migration state, affected organization/project/run IDs, provider request IDs where safe, policy decisions, webhook delivery IDs and timestamps. Never paste secrets, prompts or source code into incident tickets by default.
