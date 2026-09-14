# Token Intelligence Rollback

## Purpose

This runbook restores service after a failed Token Intelligence release without rewriting applied migration history or silently changing billing/authentication state.

## Recorded pre-release state

- Production Vercel project: `token-intelligence` (`prj_ADoR3dW8VcpJOaQcagZXOpioyM7l`)
- Stable production domain: `https://token-intelligence-eight.vercel.app`
- Known pre-release production deployment: `dpl_BbLL7UsKn1xeoGjh4JYvnMsjhJEA`
- Known pre-release production Git SHA: `126668c753c948449deb68043feb6948a6ede2c9`
- Neon project: `token-intelligence` (`restless-queen-06517393`)
- Neon production branch: `main` (`br-muddy-sun-aeyodc4h`)
- Release validation branch: `release-validation-full-site` (`br-small-haze-aeqj7d25`)
- Production migration ledger: `0000` through `0007` recorded with checksums.

Update this section with the final certified release SHA and production deployment ID immediately before promotion.

## Vercel rollback

The repository now includes `.github/workflows/release-rollback.yml` plus `npm run release:vercel:list` and `npm run release:vercel:deployment`. Normal Production promotion also captures the previous artifact and automatically restores it if post-promotion certification fails.

1. Confirm the incident is application/runtime related rather than a provider outage.
2. Run `npm run release:vercel:list` from an authorized environment to enumerate recent READY Production artifacts, then record the failing deployment ID, Git SHA, first failing route, and timestamp.
3. Prefer the **Release Rollback** workflow and provide the exact previously certified Production deployment URL plus expected Git SHA. It resolves that URL to a Vercel deployment ID, requests Vercel's project rollback API for that exact ID, then verifies both the stable Production deployment ID and expected Git SHA afterward.
4. Verify:
   - `/`
   - `/api/health`
   - `/sign-in`
   - representative public calculator flow
5. Inspect runtime errors after rollback and confirm new failures have stopped.

Do not rebuild or re-promote an arbitrary deployment and call it a rollback. A rollback must identify the exact previously deployed Production deployment ID and use Vercel's rollback mechanism.

## Database recovery

The migration runner is forward-only and checksum-pinned. Never edit an applied migration to simulate rollback.

If a release fails after a schema migration:

1. Determine whether the previous application artifact is compatible with the current schema.
2. Prefer application rollback when migrations are additive/backward compatible.
3. Use the pre-release Neon branch/snapshot only when database state itself must be recovered.
4. Before any restore, capture current production LSN/timestamp and migration ledger.
5. Never reset or restore production destructively without explicit incident approval and a verified recovery target.

The `release-validation-full-site` branch is a schema/data reference, not automatic permission to overwrite production.

## Stripe rollback

- Keep the existing live Token Intelligence Product/Price objects unless the release changed billing semantics.
- If a newly configured webhook is causing repeated failures, disable only that endpoint while the application is rolled back.
- Do not manually grant entitlements as a rollback mechanism.
- Reconcile subscription state from Stripe after webhook delivery is restored.

## WorkOS rollback

- Restore only the prior known-good redirect/logout/origin configuration if a newly added origin breaks authentication.
- Do not weaken callback state validation.
- Do not replace production credentials with Staging credentials.
- If Directory Sync webhook processing is the incident source, disable the newly configured endpoint rather than bypassing signature verification.

## Environment-variable rollback

Before promotion, record which Vercel Production variables changed by name (never secret values). If rollback requires restoring configuration:

1. restore the prior value/version through the authorized secret-management path;
2. restore the known-good Production deployment through Vercel rollback, or create a new staged Production release only when configuration changes require a rebuild;
3. verify `/api/health` and authentication;
4. verify no Preview value leaked into Production.

## Post-rollback verification

A rollback is successful only when:

- stable production domain serves the intended prior artifact;
- health behavior matches that artifact;
- database connectivity is valid;
- authentication does not produce callback/session errors;
- Stripe webhook errors stop or are intentionally disabled;
- no repeated credential-vault/decryption errors appear;
- runtime logs are free of the release-triggered error.

Record the incident, failed SHA, restored deployment ID, database state, and provider changes in the release record.
