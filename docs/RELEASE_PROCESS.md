# Token Intelligence Release Process

## Invariant

The exact Git SHA is certified first in the non-production Preview environment. Production is then built once with the Production environment as a **staged Production deployment** using `--prod --skip-domain`. That staged Production deployment is certified before it receives traffic, and `vercel promote` must move that exact deployment to the stable domain without rebuilding it. Certification fails if the Production deployment ID differs from the staged deployment ID.

## Repository commands

- `npm run release:gate` — repository-controlled release validation. Provider configuration may remain externally blocked.
- `npm run release:gate:production` — strict provider-aware production gate.
- `npm run env:validate -- --scope=production|preview|local-test`
- `npm run workos:configure -- --scope=production|preview --base-url=...` — idempotently ensures the WorkOS redirect URI and CORS origin through the environment API key.
- `npm run workos:verify -- --scope=production|preview [--base-url=...]` — Production also verifies the real WorkOS webhook URL, enabled state, exact implemented Directory Sync event set and signing-secret match without disclosing the secret.
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
5. proves the configured database is Neon project `restless-queen-06517393`, branch `br-small-haze-aeqj7d25`;
6. applies forward-only migrations to that verified validation branch and checks exact migration checksums;
7. builds with a trusted build-time SHA;
8. deploys the prebuilt artifact;
9. certifies public routes, `/api/build`, fail-closed callback behavior, MCP challenge and `/api/health`;
10. runs a real WorkOS/AuthKit sign-in → callback → workspace → sign-out lifecycle using CI-only release credentials;
11. proves true first-user onboarding against Preview and cleans only the generated Preview fixture afterward;
12. proves Stripe test Checkout + portal + signed subscription lifecycle without making a charge;
13. verifies MCP protected-resource metadata and AuthKit issuer/JWKS;
14. rejects recent Preview 5xx runtime errors;
15. emits `release-manifest.json` and `release-report.md`.

A Vercel READY state alone is not certification.

## Production

Run **Release Production** only with the Preview workflow run ID and the same exact SHA. The GitHub `production` environment should require human approval.

The workflow downloads the certified Preview manifest and re-certifies that exact source SHA. It then validates the actual Vercel Production environment and WorkOS/Stripe prerequisites, proves the Production database is Neon branch `br-muddy-sun-aeyodc4h`, and applies/validates forward-only migrations there.

Next it pulls the Production Vercel settings, builds the exact SHA with `vercel build --prod`, deploys it as a **staged Production deployment** with `vercel deploy --prebuilt --prod --skip-domain`, configures the staged WorkOS redirect/CORS origin, and certifies the staged deployment's build identity, health, MCP OAuth, real AuthKit sign-in/callback/sign-out and recent 5xx logs **before traffic is moved**. Only then does it promote the staged Production URL. After promotion it verifies the stable domain and requires its Vercel deployment ID to equal the staged deployment ID. If any post-promotion certification step fails, the workflow re-promotes the captured previous Production artifact and verifies the rollback deployment ID.

PR #14 remains draft until this gate passes plus real provider/account checks have been completed.

## Finalization

After the certified SHA is merged into `main`, **Finalize Certified Release** verifies that the SHA is an ancestor of `main`, recertifies Production identity/health, and creates the version tag/GitHub Release if it does not already exist.

## Rollback

**Release Rollback** requires an exact prior deployment URL and its expected Git SHA. It verifies the target before promotion and verifies the stable Production domain afterward. It does not roll back the database. The canonical release gate also refuses to run migrations against a non-loopback database unless `TOKEN_INTELLIGENCE_RELEASE_DISPOSABLE_DATABASE=1` is explicitly set.

See `docs/ROLLBACK.md` for database/provider incident procedures.
