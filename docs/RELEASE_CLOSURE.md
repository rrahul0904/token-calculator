# Token Intelligence Release Closure

Last reconciled: 2026-09-12 UTC

This file records release evidence and blockers. Missing provider/account evidence is never converted into PASS.

## Release identity

- Repository: `rrahul0904/token-calculator`
- Canonical release branch: `release-candidate-full-site`
- Canonical release PR: #14 — `release: full-site integration candidate`
- Stable Production: `https://token-intelligence-eight.vercel.app`
- Vercel project: `token-intelligence` (`prj_ADoR3dW8VcpJOaQcagZXOpioyM7l`)
- Vercel team: `team_zmEezpOKGZy2sH5nqTfO44LD`
- Neon project: `restless-queen-06517393`
- Neon validation branch: `release-validation-full-site` (`br-small-haze-aeqj7d25`)
- Neon Production branch: `main` (`br-muddy-sun-aeyodc4h`)
- WorkOS Staging: `environment_01M1G0NYZ6EX1MR9Z51Y7VZ15X`
- WorkOS Production: `environment_01M1G0NZHV4J3CNS2WQZB2JER4`
- Stripe live account: `acct_1QrNa7RB8OGmEnBw`

The exact final SHA and CI run are recorded in PR #14 only after the final branch head completes the full matrix.

## Repository implementation state

The launch product is implemented end to end at the repository level, including:

- browser-local tokenization, exact/estimated precision disclosure and cost calculation;
- source-backed/effective-dated pricing and immutable pricing intelligence;
- workload economics, cache economics, reverse budget solver and model comparisons;
- Prompt A/B Cost Lab with metadata-only saved scenario create/list/rename/duplicate/delete lifecycle;
- canonical Agent Run Receipt, usage classes, outcomes, findings, FinOps and provider-usage import;
- evaluation datasets, cases, controlled experiments, baseline/candidate result ingestion and deterministic regression/savings gate;
- budgets, website policy authoring, pre-call policy checks, approval queue and approve/deny lifecycle;
- teams/project attribution, service accounts, API keys, audit/export, privacy controls and directory lifecycle;
- governed provider gateway compatibility routes and MCP API-key/OAuth support;
- WorkOS/AuthKit session/callback/sign-out hardening;
- Stripe Checkout/portal/webhook entitlement implementation;
- ephemeral WorkOS release-certification users created, masked and deleted by Preview/Production workflows;
- forward migrations through `0008_workload_pricing_intelligence`;
- exact-SHA Preview certification, staged Production certification/promotion and automatic rollback controls.

Authenticated browser acceptance now covers the experiment lifecycle, saved scenario history, budget/policy/approval control plane and the existing tenant/API-key/privacy/workspace journeys. Prompt content remains non-durable in Cost Lab and evaluation workflows.

Issue #1 is closed as completed. Issue #3 remains open only for broader post-launch collector/control-plane expansion; those future roadmap phases are not current launch blockers.

## Current certification matrix

| Area | Status | Evidence |
|---|---|---|
| Repository implementation | PENDING_FINAL_EXACT_HEAD_CI | Functional wave passed lint/typecheck/unit/migrations/DB integration/build and Playwright on the implementation head; documentation reconciliation moved the branch and requires one final exact-head run |
| Migration chain | PASS | CI applies `0000` through `0008` on disposable PostgreSQL and verifies checksums/schema/triggers |
| Neon validation branch | PASS | `0008` applied and verified on `br-small-haze-aeqj7d25` |
| Neon Production baseline | PASS_BASELINE | Production remains intentionally through `0007`; `0008` is reserved for the gated Production workflow |
| WorkOS Staging | PASS_PROVIDER | AuthKit/API key, Preview origins, MCP OAuth resources, Directory Sync webhook and ephemeral-user create/delete smoke verified |
| Stripe live catalog/webhook | PASS_PROVIDER | Pro $15/month, Team $29/seat/month and exact Production lifecycle webhook verified |
| Vercel deployment credential | BLOCKED_EXTERNAL | GitHub Actions `VERCEL_TOKEN` is still absent; fresh Preview preflight re-check confirmed it |
| Vercel Preview runtime | BLOCKED_EXTERNAL | Existing Preview is stale and has an invalid/stale `DATABASE_URL`; correct persistent validation DB + WorkOS Staging + Stripe TEST runtime must be installed |
| Stripe TEST certification | BLOCKED_EXTERNAL | Current connected Stripe context exposes live mode only; Preview verifier intentionally requires TEST mode |
| WorkOS Production activation | BLOCKED_EXTERNAL | WorkOS reports Production `Inactive`; billing address/default payment method are absent |
| WorkOS Production objects | BLOCKED_EXTERNAL | Production redirects/logout/origins/MCP resource/webhook cannot be configured while inactive; even a dry-run redirect mutation returns `FORBIDDEN` |
| Vercel Production runtime | BLOCKED_EXTERNAL | Stable deployment is old and does not yet contain the launch-critical Production runtime contract |
| Exact-SHA Preview certification | BLOCKED_EXTERNAL | Cannot deploy until Vercel credential/runtime gates above are resolved |
| Production certification | NOT_RUN | Must consume a certified Preview manifest; no Production traffic change is allowed before staged certification |
| PR #14 merge | BLOCKED | Remains draft until Preview + Production are certified |

GitHub outcome attribution, OTEL and Redis are optional and are not launch-critical release checks.

## External blockers and exact boundaries

### 1. Vercel credential and runtime configuration

`VERCEL_TOKEN` is the only mandatory GitHub deployment secret remaining. Permanent release-user credentials were removed; release workflows provision temporary WorkOS users themselves.

The connected GitHub integration intentionally excludes Actions-secret mutation. The connected Vercel integration exposes project/deployment inspection but not environment-variable or Git-link writes. Vercel CLI pull/deploy/promote requires an authorization token, so bypassing this credential would weaken or break the certified release path.

Required account-side state:

- GitHub Actions secret `VERCEL_TOKEN` scoped to the existing Vercel team/project;
- Preview runtime: persistent validation-branch `DATABASE_URL`, WorkOS Staging values, Stripe TEST secret/webhook/prices, vault and cron values;
- Production runtime, after WorkOS activation: Production Neon, WorkOS Production, live Stripe, vault and cron values from the typed env contract.

### 2. WorkOS Production activation

WorkOS still reports Production `Inactive`. Billing data shows no billing address and no default payment method. The connector has no payment-method mutation, and real billing information must not be guessed.

Once the existing workspace is activated with real billing details, the release workflow can configure/verify the public application state using the Production API key and its own ephemeral auth-certification user.

Expected stable public values:

- callback: `https://token-intelligence-eight.vercel.app/auth/callback`
- logout: `https://token-intelligence-eight.vercel.app/`
- sign-in: `https://token-intelligence-eight.vercel.app/sign-in`
- Directory webhook: `https://token-intelligence-eight.vercel.app/api/webhooks/workos`
- MCP resource: `https://token-intelligence-eight.vercel.app/mcp`
- issuer: `https://trustworthy-monolith-63.authkit.app`

### 3. Stripe TEST Preview access

Live Stripe provider resources are already correct. Preview billing certification deliberately refuses live keys and performs no-charge TEST-mode Checkout, portal and signed subscription lifecycle reconciliation. The current connected Stripe session still exposes live mode only.

## Required final release sequence

1. Final exact-head CI passes.
2. Install `VERCEL_TOKEN` and correct Preview runtime values.
3. Release Preview verifies Neon identity/migrations, provisions temporary WorkOS Staging users, deploys the exact SHA, certifies AuthKit/onboarding/Stripe TEST/MCP/health/5xx, cleans temporary users and emits `preview_certified` evidence.
4. Activate WorkOS Production with real billing information and install the Production runtime contract.
5. Release Production downloads/re-certifies the Preview manifest, verifies WorkOS/live Stripe/Neon and applies forward-only `0008` to the verified Production branch.
6. The workflow creates a staged Production deployment without moving traffic, provisions a temporary Production AuthKit user, and certifies build identity/health/auth/MCP/5xx.
7. It promotes the already-certified staged deployment and proves the stable domain serves the same deployment ID.
8. Any failed post-promotion certification triggers automatic rollback; temporary auth users are cleaned up.
9. Only after stable Production certification may PR #14 be marked ready and merged.
10. Finalization verifies the certified SHA is on `main` and creates the release/tag record.

## Final determination

`NOT PRODUCTION CERTIFIED`

Repository functionality is no longer the launch blocker. Production completion is now gated by the explicit provider/account configuration above and the resulting exact-SHA Preview/Production certification evidence.
