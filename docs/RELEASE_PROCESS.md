# Token Intelligence Release Process

## Invariant

Preview certification and Production promotion use one immutable Vercel artifact. Production is promoted with `vercel promote`; it is never rebuilt after Preview certification.

## Repository commands

- `npm run release:gate` — repository-controlled release validation. Provider configuration may remain externally blocked.
- `npm run release:gate:production` — strict provider-aware production gate.
- `npm run env:validate -- --scope=production|preview|local-test`
- `npm run workos:verify -- --scope=production|preview [--base-url=...]`
- `npm run stripe:verify [-- --require]`
- `npm run mcp:verify -- --base-url=... [--require]`
- `npm run release:verify:deployment -- --mode=preview|production --url=... --sha=...`
- `npm run release:verify:auth -- --base-url=...` — real WorkOS/AuthKit lifecycle using server-only release-test credentials.
- `npm run release:verify:onboarding -- --base-url=...` — one-time fresh-user onboarding certification.
- `npm run release:vercel:list` — list recent READY Production artifacts without exposing the Vercel token.

Provider verifiers never print credential values.

## Preview

Run **Release Preview** with an exact 40-character SHA. The workflow:

1. validates the exact SHA and the existing Vercel project ID;
2. reruns the complete repository release gate;
3. links only the existing Token Intelligence Vercel project;
4. pulls Preview project settings;
5. builds with a trusted build-time SHA;
6. deploys the prebuilt artifact;
7. certifies public routes, `/api/build`, fail-closed callback behavior, MCP challenge and `/api/health`;
8. emits `release-manifest.json` and `release-report.md`.

A Vercel READY state alone is not certification.

## Production

Run **Release Production** only with the Preview workflow run ID and the same exact SHA. The GitHub `production` environment should require human approval.

The workflow downloads the certified manifest, recertifies Preview, validates the actual Vercel Production environment and WorkOS/Stripe prerequisites, captures the current Production deployment, and promotes that exact Preview artifact without rebuilding. It then certifies build identity, health, real AuthKit sign-in/callback/sign-out, and recent 5xx logs. If any post-promotion certification step fails, the workflow automatically re-promotes the captured previous Production artifact and verifies the alias points back to its deployment ID.

PR #14 remains draft until this gate passes plus real provider/account checks have been completed.

## Finalization

After the certified SHA is merged into `main`, **Finalize Certified Release** verifies that the SHA is an ancestor of `main`, recertifies Production identity/health, and creates the version tag/GitHub Release if it does not already exist.

## Rollback

**Release Rollback** requires an exact prior deployment URL and its expected Git SHA. It verifies the target before promotion and verifies the stable Production domain afterward. It does not roll back the database. The canonical release gate also refuses to run migrations against a non-loopback database unless `TOKEN_INTELLIGENCE_RELEASE_DISPOSABLE_DATABASE=1` is explicitly set.

See `docs/ROLLBACK.md` for database/provider incident procedures.
