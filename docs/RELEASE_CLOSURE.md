# Token Intelligence Release Closure

Last reconciled: 2026-09-08 UTC

This file records release evidence and blockers. It must not turn missing provider/account evidence into PASS.

## Release identity

- Repository: `rrahul0904/token-calculator`
- Canonical release branch: `release-candidate-full-site`
- Release PR: #14 — `release: full-site integration candidate`
- Stable Production domain: `https://token-intelligence-eight.vercel.app`
- Vercel project: `token-intelligence` (`prj_ADoR3dW8VcpJOaQcagZXOpioyM7l`)
- Neon project: `restless-queen-06517393`
- Neon validation branch: `release-validation-full-site` (`br-small-haze-aeqj7d25`)
- Neon Production branch: `main` (`br-muddy-sun-aeyodc4h`)
- WorkOS Staging environment: `environment_01M1G0NYZ6EX1MR9Z51Y7VZ15X`
- WorkOS Production environment: `environment_01M1G0NZHV4J3CNS2WQZB2JER4`
- Stripe live account context: `acct_1QrNa7RB8OGmEnBw`

The final SHA and final CI run IDs are recorded in the PR evidence comment after the exact document/code head completes CI. A Vercel READY state by itself is not release certification.

## Repository-controlled implementation

The repository now contains the complete release-control path required to move an exact source SHA through non-production verification, staged Production certification, immutable Production promotion and rollback.

Implemented controls include:

- typed Preview/Production/local environment contract and fail-closed validation;
- `GET /api/build` deployment identity with Git SHA, deployment ID, environment and build time;
- exact-SHA Preview workflow with full repository gate, Neon branch identity check, migrations/checksums, immutable build/deploy, real AuthKit lifecycle, first-user onboarding, no-charge Stripe test lifecycle, MCP verification, 5xx scan and release evidence;
- WorkOS Staging wildcard redirect/logout/origin configuration for generated Token Intelligence Vercel Preview hostnames;
- Production WorkOS redirect/CORS configuration via API key plus strict provider verification;
- Production WorkOS provider verification of the exact `/api/webhooks/workos` URL, enabled status, exact source-implemented Directory Sync event set and signing-secret match without secret disclosure;
- live Stripe catalog/webhook verification for the exact Production route and source-implemented event set;
- Neon project/branch identity guard before any release migration;
- exact migration-ledger set and SHA-256 checksum verification;
- staged Production build using Production environment settings;
- staged Production deployment using `--prod --skip-domain` so no traffic moves before certification;
- staged Production build/health/AuthKit/MCP/5xx certification;
- promotion of the already-certified staged Production deployment;
- post-promotion deployment-ID equality check proving the stable domain serves the exact staged artifact;
- automatic restoration of the previously captured Production deployment if post-promotion certification fails;
- exact-artifact manual rollback workflow;
- post-merge release/tag finalization workflow;
- first-user onboarding concurrency serialization across both identity and WorkOS organization;
- Stripe checkout idempotency, customer-creation race handling, Pro single-seat enforcement, replay safety, stale/out-of-order event rejection and cancel-at-period-end coverage;
- repository secret-policy gate and full-history Gitleaks.

There are no known repository TODO/FIXME/NOT_IMPLEMENTED markers. The implementation is not called repository-certified until the exact current head completes the full CI matrix.

## Current certification matrix

| Area | Status | Evidence |
|---|---|---|
| Repository release controls | PENDING_FINAL_CI | All known code/test gaps are implemented; exact-head CI is the remaining repository proof |
| Neon Production migration ledger | PASS | Production contains migrations `0000` through `0007` with checksums |
| Neon validation schema parity | PASS | `compare_database_schema` between validation and Production returned an empty diff on 2026-09-08 |
| WorkOS Staging Preview redirects/logout/origins | PASS | Exact Token Intelligence Vercel wildcard pattern is configured in Staging while preserving the existing default Preview URL |
| Stripe live catalog | PASS | Pro is USD 15/month and Team is USD 29/month in the existing live Stripe account |
| Stripe live webhook object | PASS | Existing endpoint `we_1UDCwARB8OGmEnBwuRlJ9w5V` targets the stable Token Intelligence Stripe webhook route with the subscription/invoice events implemented by source |
| WorkOS Production activation | BLOCKED_EXTERNAL | WorkOS reports `productionState: Inactive` |
| WorkOS Production billing readiness | BLOCKED_EXTERNAL | Billing address and default payment method are absent |
| WorkOS Production AuthKit domain | PASS_PROVIDER_OBJECT | Environment exposes `trustworthy-monolith-63.authkit.app`; runtime installation/certification is still pending |
| WorkOS Production redirects/logout/origins | BLOCKED_EXTERNAL | Production application configuration remains unavailable while Production is inactive; redirect/CORS automation is ready to run after activation |
| WorkOS Production webhook | BLOCKED_EXTERNAL | No Production WorkOS webhook endpoint is currently configured |
| WorkOS MCP OAuth resource | BLOCKED_EXTERNAL | Production AuthKit OAuth Resource Indicator still requires provider configuration after Production activation |
| GitHub/Vercel release credentials | BLOCKED_EXTERNAL | Release Preview preflight reports the required deployment/auth certification secrets are not configured |
| Exact-SHA Vercel Preview | BLOCKED_EXTERNAL | Release workflow intentionally skips deployment when release credentials are absent |
| Stable Production artifact | FAIL | `/api/build` on the stable domain returns 404, proving Production is still an older artifact that predates release identity |
| Production certification | FAIL | Exact staged Production certification/promotion has not run |
| PR #14 merge | BLOCKED | PR remains draft and must not merge before Production certification |

## External blockers

### 1. GitHub Actions release credentials

**BLOCKER:** The Release Preview preflight has no values for:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `RELEASE_AUTH_EMAIL`
- `RELEASE_AUTH_PASSWORD`
- `RELEASE_ONBOARDING_AUTH_EMAIL`
- `RELEASE_ONBOARDING_AUTH_PASSWORD`

`VERCEL_AUTOMATION_BYPASS_SECRET` is additionally required only if Vercel Deployment Protection blocks the automation.

**WHY CODE CANNOT FIX IT:** GitHub Actions secrets are account/repository credentials. The connected GitHub integration intentionally does not expose secret mutation APIs and the values must not be invented or committed.

**EXACT ACTION REQUIRED:** Configure the seven required secrets in GitHub Actions for this repository, with `VERCEL_PROJECT_ID=prj_ADoR3dW8VcpJOaQcagZXOpioyM7l` and the Vercel org ID for the existing team. Use dedicated low-privilege WorkOS release-test accounts for the AuthKit credentials.

**HOW TO VERIFY:** A push to `release-candidate-full-site` makes the Release Preview preflight output `ready=true` and the `preview` job runs instead of being skipped.

### 2. WorkOS Production activation and billing

**BLOCKER:** WorkOS Production remains inactive. The team has no billing address and no default payment method.

**WHY CODE CANNOT FIX IT:** The connected WorkOS ADMIN session exposes no operation that adds a payment method or changes `productionState` to Active. Billing data must not be guessed.

**EXACT ACTION REQUIRED:** Complete the existing WorkOS team's Production activation/billing flow using real billing details.

**HOW TO VERIFY:** WorkOS reports `productionState: Active`; set GitHub Production environment evidence variables only after observing the real state:

- `WORKOS_PRODUCTION_STATE=active`
- `WORKOS_BILLING_ADDRESS_CONFIGURED=true`
- `WORKOS_PAYMENT_METHOD_CONFIGURED=true`

### 3. WorkOS Production AuthKit / webhook / MCP provider objects

**BLOCKER:** Production still needs its final sign-out URI, Sign-in URL, Directory Sync webhook and AuthKit MCP Resource Indicator.

**AUTOMATION ALREADY IMPLEMENTED:** Once Production is active, the release workflow idempotently ensures the exact stable/staged redirect URI and CORS origin. The strict verifier queries WorkOS for the Production webhook and fails unless the URL, enabled status, exact implemented event set and signing secret match.

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

**HOW TO VERIFY:** Strict `workos:verify`, real AuthKit lifecycle, signed Directory Sync delivery and `mcp:verify` all pass.

### 4. Vercel Production runtime values

**BLOCKER:** The existing Production deployment does not contain the launch-critical release configuration.

**WHY CODE CANNOT FIX IT IN THIS SESSION:** The connected Vercel integration can inspect/deploy but does not expose environment-variable mutation. The GitHub workflow has the complete CLI-based release path, but its Vercel token is not configured.

**EXACT ACTION REQUIRED:** Install the Production/Preview values defined by `scripts/release/env-contract.ts` / `docs/PRODUCTION_CONFIGURATION.md` in the existing Vercel project. Do not create a replacement Vercel project.

**HOW TO VERIFY:** `npm run env:validate -- --scope=production` succeeds through `vercel env run -e production`.

## Required release sequence after external prerequisites

1. Push/freeze one exact `release-candidate-full-site` SHA.
2. Exact-head CI passes.
3. Release Preview runs instead of skipping.
4. Exact-SHA Preview passes real AuthKit, onboarding, Stripe test lifecycle, MCP, health and 5xx gates.
5. Production workflow validates WorkOS/Stripe/Neon.
6. Production workflow creates a staged Production build/deployment with no domain assignment.
7. Staged Production passes build identity, health, AuthKit, MCP and 5xx certification.
8. The already-certified staged Production deployment is promoted.
9. Stable Production deployment ID must equal the staged deployment ID.
10. Stable Production health/runtime checks pass.
11. PR #14 can be marked ready and merged.
12. Finalization verifies the certified SHA is on `main` and creates the release/tag record.

## Final determination

`NOT PRODUCTION CERTIFIED`

Do not change this determination until every FAIL/BLOCKED item above has verified PASS evidence.
