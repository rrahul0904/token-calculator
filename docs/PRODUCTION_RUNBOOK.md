# Production Runbook

## Release topology

Production is deployed from the verified `main` commit through the existing Vercel project `token-intelligence`. Do not create a second Vercel project for release candidates.

Preview release candidates should use a Neon validation branch and Stripe test-mode configuration. Production must use the intended Neon production branch, live WorkOS configuration and live Stripe Price IDs.

## Required production configuration

- `APP_BASE_URL`
- `DATABASE_URL`
- `WORKOS_API_KEY`
- `WORKOS_CLIENT_ID`
- `WORKOS_COOKIE_PASSWORD`
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI`
- `WORKOS_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_TEAM`
- `TOKEN_INTELLIGENCE_ENCRYPTION_KEY`
- `CRON_SECRET`
- `GITHUB_APP_ID`
- `GITHUB_PRIVATE_KEY`
- `GITHUB_WEBHOOK_SECRET`
- `TOKEN_INTELLIGENCE_WEBHOOK_SECRET`

OTLP is optional and controlled by `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_HEADERS`.

## Database migration

1. Create a Neon rollback branch from the current production branch.
2. Create a `release-validation` branch.
3. Point `DATABASE_URL` at `release-validation`.
4. Run `npm run db:migrate`.
5. Run `npm run db:verify`.
6. Run application integration tests against that branch.
7. Only then run the same migration runner against the production Neon branch.

The migration runner uses an advisory lock and stores SHA-256 checksums in `_token_intelligence_migrations`. An applied migration whose contents later change fails with `MIGRATION_CHECKSUM_MISMATCH`; fix by adding a new migration, never by rewriting production history.

## Build gate

A release is eligible for preview only after an actual environment executes:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run db:check
npm run sdk:build
npm run build
```

Database validation additionally requires:

```bash
npm run db:migrate
npm run db:verify
```

Do not mark commands as passing if no runner executed them.

## Preview gate

Deploy the release candidate to the existing Vercel project. Preview configuration must not use live Stripe Price IDs. Verify `/`, `/developers`, `/openapi.json`, `/api/health`, protected `/app/*`, `/mcp` auth behavior and all configured webhooks.

## Production promotion

1. Confirm CI actually executed on the release SHA.
2. Confirm preview browser/E2E checks are green.
3. Confirm Neon rollback branch exists.
4. Confirm production Stripe mode is live and Price IDs are live-mode Token Intelligence products.
5. Merge the dependency stack in order, ending with the release candidate.
6. Deploy/promote the final verified `main` SHA.
7. Repeat production smoke tests.

## Rollback

If post-production smoke fails:

1. Re-promote the prior known-good Vercel production deployment.
2. If failure is database-related, point application traffic only to a compatible database state; use the pre-migration Neon branch as the recovery reference. Do not blindly reverse destructive SQL.
3. Disable newly configured webhooks/provider integrations if they cause repeated failures.
4. Record the incident and affected release SHA.

Never hot-fix directly on production without a branch/commit and verification trail.

## Key rotation

### Token Intelligence API key
Create/rotate from the workspace. The new secret is returned once. Confirm the old secret is denied, then update the dependent service.

### Provider BYOK
Use Verify + Rotate. The new provider secret is verified before persistence; failed verification leaves the previous encrypted credential intact.

### Master encryption key
Current ciphertext is versioned at the credential record. A master-key rotation requires an explicit re-encryption migration. Do not replace `TOKEN_INTELLIGENCE_ENCRYPTION_KEY` without re-encrypting existing secrets.

## Stripe recovery

Webhook events are signature validated and should be idempotent. When delivery is interrupted, restore the endpoint and replay relevant events from Stripe. Never manually grant paid entitlements without reconciling the underlying Stripe subscription state.

## GitHub webhook recovery

GitHub deliveries are signature validated and idempotent. Re-deliver missed webhook events from GitHub where possible. Outcome attribution rejects ambiguous associations; do not force-link unrelated runs merely to fill metrics.

## Provider outage

Retries are bounded. Fallback is policy-controlled and may require approval. If the policy state/database cannot be trusted, gateway enforcement fails closed for launch-critical controls.

## Incident evidence

Capture: release SHA, Vercel deployment ID, Neon branch/migration state, affected organization/project/run IDs, provider request IDs where safe, policy decisions, webhook delivery IDs and timestamps. Never paste secrets, prompts or source code into incident tickets by default.
