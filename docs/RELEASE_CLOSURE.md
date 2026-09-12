# Token Intelligence Release Closure

Last reconciled: 2026-09-12 UTC

This file records release evidence and blockers. It must not turn missing provider/account evidence into PASS.

## Release identity

- Repository: `rrahul0904/token-calculator`
- Canonical release branch: `release-candidate-full-site`
- Release PR: #14 — `release: full-site integration candidate`
- Stable Production domain: `https://token-intelligence-eight.vercel.app`
- Vercel project: `token-intelligence` (`prj_ADoR3dW8VcpJOaQcagZXOpioyM7l`)
- Vercel team: `team_zmEezpOKGZy2sH5nqTfO44LD`
- Neon project: `restless-queen-06517393`
- Neon validation branch: `release-validation-full-site` (`br-small-haze-aeqj7d25`)
- Neon Production branch: `main` (`br-muddy-sun-aeyodc4h`)
- WorkOS Staging environment: `environment_01M1G0NYZ6EX1MR9Z51Y7VZ15X`
- WorkOS Production environment: `environment_01M1G0NZHV4J3CNS2WQZB2JER4`
- Stripe live account context: `acct_1QrNa7RB8OGmEnBw`

The exact final SHA and CI run are recorded in PR #14 only after the final branch head completes the full matrix. A Vercel READY state by itself is not release certification.

## Repository-controlled implementation

The repository contains the complete release-control path required to move an exact source SHA through non-production verification, staged Production certification, immutable Production promotion and rollback.

Implemented controls include:

- typed Preview/Production/local environment contract and fail-closed validation;
- `GET /api/build` deployment identity with Git SHA, deployment ID, environment and build time;
- exact-SHA Preview workflow with full repository gate, Neon branch identity check, migrations/checksums, immutable build/deploy, real AuthKit lifecycle, first-user onboarding, no-charge Stripe test lifecycle, MCP verification, 5xx scan and release evidence;
- ephemeral WorkOS release users provisioned from the target environment API key, masked before GitHub outputs and deleted with always-run cleanup;
- WorkOS Staging wildcard redirect/logout/origin configuration for generated Token Intelligence Vercel Preview hostnames;
- Production WorkOS redirect/CORS configuration via API key plus strict provider verification;
- Production WorkOS provider verification of the exact `/api/webhooks/workos` URL, enabled status, exact source-implemented Directory Sync event set and signing-secret match without secret disclosure;
- live Stripe catalog/webhook verification for the exact Production route and source-implemented event set;
- Neon project/branch identity guard before any release migration;
- exact migration-ledger set and SHA-256 checksum verification;
- forward migration `0008_workload_pricing_intelligence` and pre-production copy-on-write validation;
- staged Production build using Production environment settings;
- staged Production deployment using `--prod --skip-domain` so no traffic moves before certification;
- staged Production build/health/AuthKit/MCP/5xx certification;
- promotion of the already-certified staged Production deployment;
- post-promotion deployment-ID equality check proving the stable domain serves the exact staged artifact;
- automatic Vercel rollback to the previously captured Production deployment ID if post-promotion certification fails;
- exact Production-deployment-ID manual rollback workflow using Vercel's rollback API;
- post-merge release/tag finalization workflow;
- first-user onboarding concurrency serialization across both identity and WorkOS organization;
- Stripe checkout idempotency, customer-creation race handling, Pro single-seat enforcement, replay safety, stale/out-of-order event rejection and cancel-at-period-end coverage;
- repository secret-policy gate and full-history Gitleaks.

There are no known repository TODO/FIXME/NOT_IMPLEMENTED release blockers. The implementation is not called repository-certified until the exact current head completes the full CI matrix.

## Current certification matrix

| Area | Status | Evidence |
|---|---|---|
| Repository release controls | PENDING_FINAL_CI | Prior canonical head passed full CI; ephemeral-user release hardening changed the branch and must earn a new exact-head certification |
| Neon Production migration ledger | PASS_BASELINE | Production contains migrations `0000` through `0007`; `0008` is intentionally gated for Production workflow |
| Neon validation migration/schema | PASS | Exact `0008` DDL applied successfully to validation branch; schema comparison against Production shows only the expected five tables/indexes/FKs |
| WorkOS Staging provider configuration | PASS | Staging has AuthKit app/API key, Preview redirect/logout/origin coverage, MCP OAuth resources and active exact-event Directory Sync webhook |
| Stripe live catalog | PASS | Pro is USD 15/month and Team is USD 29/month in the existing live Stripe account |
| Stripe live webhook object | PASS | Enabled endpoint targets the stable Token Intelligence Stripe webhook route with exactly the required subscription/invoice events |
| WorkOS Production activation | BLOCKED_EXTERNAL | WorkOS reports `productionState: Inactive` |
| WorkOS Production billing readiness | BLOCKED_EXTERNAL | Production activation still requires real billing address/payment method through WorkOS account controls |
| WorkOS Production app/webhook/MCP | BLOCKED_EXTERNAL | Production is inactive; connected ADMIN session receives `FORBIDDEN` for Production mutations, and Production app/webhook/MCP configuration is currently empty |
| GitHub/Vercel deployment credential | BLOCKED_EXTERNAL | Release Preview now requires only `VERCEL_TOKEN` (plus optional protection-bypass secret); GitHub connector intentionally cannot write Actions secrets |
| Vercel Preview runtime values | BLOCKED_EXTERNAL | Existing Preview is stale SHA and its current `DATABASE_URL` fails even `select 1`; correct validation DB + WorkOS Staging + Stripe TEST values must be installed in Preview environment |
| Stripe TEST certification | BLOCKED_EXTERNAL | Preview verifier requires TEST-mode Stripe; current connected Stripe session exposes only live mode |
| Exact-SHA Vercel Preview | BLOCKED_EXTERNAL | Token Intelligence Vercel project has no Git link and current tool surface cannot manage env/Git linkage; release workflow can deploy once `VERCEL_TOKEN` and Preview env exist |
| Stable Production artifact | FAIL_OLD_ARTIFACT | Stable domain is an older deployment without current `/api/build` identity/runtime configuration |
| Production certification | FAIL_NOT_RUN | Exact staged Production certification/promotion has not run |
| PR #14 merge | BLOCKED | PR remains draft and must not merge before Preview + Production certification |

GitHub outcome attribution, OTEL and Redis are optional integrations and are not launch-critical release checks.

## External blockers

### 1. Vercel deployment token and runtime environments

**BLOCKER:** `VERCEL_TOKEN` is not installed as a GitHub Actions secret, the Token Intelligence Vercel project currently has `link: null`, and the connected Vercel tool surface does not expose project-environment or Git-link mutation.

The current old Preview also has a stale/invalid `DATABASE_URL`; Neon itself is healthy.

**WHY CODE CANNOT FIX IT:** Repository secrets and Vercel project secret values are privileged account credentials. The available GitHub connector explicitly excludes secrets APIs; the available Vercel connector can inspect deployments/projects but does not expose environment-variable or Git-link writes.

**EXACT ACTION REQUIRED:**

- configure GitHub Actions secret `VERCEL_TOKEN` with access to the existing Vercel team/project;
- refresh Vercel Preview variables with the validation-branch Neon URL, WorkOS Staging runtime values and Stripe TEST values/prices;
- configure Vercel Production variables with Production Neon, WorkOS Production, live Stripe, vault and cron values once WorkOS Production is active.

No persistent release-user passwords are required anymore; the workflows provision and delete temporary WorkOS users automatically.

**HOW TO VERIFY:** A push/dispatch of Release Preview makes preflight `ready=true`; Preview environment validation, database identity and ephemeral-user provisioning then proceed.

### 2. WorkOS Production activation and billing

**BLOCKER:** WorkOS Production remains inactive and the connected ADMIN session cannot mutate Production configuration while inactive.

**WHY CODE CANNOT FIX IT:** The connected WorkOS surface exposes no permitted operation to add the real billing address/payment method or activate Production. Billing data must not be guessed.

**EXACT ACTION REQUIRED:** Complete the existing WorkOS team's Production activation/billing flow using real billing details.

**HOW TO VERIFY:** WorkOS reports `productionState: Active`; set GitHub Production environment evidence variables only after observing the real state:

- `WORKOS_PRODUCTION_STATE=active`
- `WORKOS_BILLING_ADDRESS_CONFIGURED=true`
- `WORKOS_PAYMENT_METHOD_CONFIGURED=true`

After activation, the Production workflow uses the Production `WORKOS_API_KEY` to configure/verify redirects and creates its own temporary auth-certification user.

### 3. WorkOS Production AuthKit / webhook / MCP provider objects

**BLOCKER:** Production currently has no redirects/logout origins, no MCP OAuth Resource Indicator and no webhook endpoint.

**AUTOMATION ALREADY IMPLEMENTED:** Once Production is active and its runtime API key is installed, the release workflow idempotently ensures the stable/staged redirect URI and CORS origin and strictly verifies provider state.

**EXACT VALUES:**

- Stable callback: `https://token-intelligence-eight.vercel.app/auth/callback`
- Stable sign-out URI: `https://token-intelligence-eight.vercel.app/`
- Sign-in URL: `https://token-intelligence-eight.vercel.app/sign-in`
- Directory webhook: `https://token-intelligence-eight.vercel.app/api/webhooks/workos`
- MCP resource: `https://token-intelligence-eight.vercel.app/mcp`
- AuthKit issuer/domain: `https://trustworthy-monolith-63.authkit.app`

The WorkOS webhook must subscribe only to:

- `dsync.deleted`
- `dsync.group.created`
- `dsync.group.deleted`
- `dsync.group.updated`
- `dsync.group.user_added`
- `dsync.group.user_removed`
- `dsync.user.created`
- `dsync.user.deleted`
- `dsync.user.updated`

### 4. Stripe TEST-mode Preview access

**BLOCKER:** Live Stripe objects are correct, but Preview certification is deliberately TEST-only and the current connected Stripe context exposes live mode only.

**WHY CODE CANNOT FIX IT:** The release workflow refuses live Stripe keys on Preview by design.

**HOW TO VERIFY:** Preview `STRIPE_SECRET_KEY` is TEST mode, TEST Pro/Team prices are configured, and `release:verify:billing` passes checkout + portal + signed lifecycle reconciliation while reporting `charged: false`.

## Required release sequence after external prerequisites

1. Freeze one exact `release-candidate-full-site` SHA and pass exact-head CI.
2. Configure `VERCEL_TOKEN` and correct Vercel Preview runtime values.
3. Release Preview verifies Neon identity/migrations, provisions ephemeral Staging users, deploys the exact SHA, certifies AuthKit/onboarding/Stripe TEST/MCP/health/5xx, deletes temporary users and emits `preview_certified` evidence.
4. Activate WorkOS Production and install Production runtime values.
5. Release Production downloads/re-certifies the Preview manifest, verifies WorkOS/live Stripe/Neon, provisions a temporary Production AuthKit user and applies forward-only migrations including `0008`.
6. Production workflow creates a staged Production deployment with no domain assignment and certifies build identity, health, AuthKit, MCP and 5xx before traffic.
7. The already-certified staged Production deployment is promoted.
8. Stable Production deployment ID must equal the staged deployment ID; stable health/auth/MCP checks pass.
9. Temporary Production WorkOS user is deleted, including on failed runs.
10. PR #14 can be marked ready and merged.
11. Finalization verifies the certified SHA is on `main` and creates the release/tag record.

## Final determination

`NOT PRODUCTION CERTIFIED`

Do not change this determination until every FAIL/BLOCKED item above has verified PASS evidence.
