# Token Intelligence Release Coverage Matrix

Last reconciled: 2026-09-12 UTC

This matrix describes the canonical release candidate on `release-candidate-full-site` / PR #14. It is evidence-driven: schema-only work is not treated as a complete user journey, and provider/account configuration is never mislabeled as live application functionality.

## Status legend

- `IMPLEMENTED_AND_TESTED` — the product path exists and is covered by automated unit/integration/browser evidence.
- `IMPLEMENTED_PROVIDER_GATED` — application code and release automation exist, but a live provider/account credential or activation step is still required.
- `POST_LAUNCH_ROADMAP` — deliberately broader follow-on capability that is not required for this website launch.

## Product and economics

| Area | Release evidence | Status |
| --- | --- | --- |
| Browser-local token calculator | Web Worker tokenization, exact/estimated precision labels, model catalog, content-free share state, calculator/browser tests | IMPLEMENTED_AND_TESTED |
| Pricing intelligence | Source URLs/timestamps, effective-dated pricing, immutable snapshots, reviewed override/refresh path, pricing tests | IMPLEMENTED_AND_TESTED |
| Workload economics | Tokens→cost, cost→tokens, cache read/write economics, long-context behavior, endpoint selection, comparisons, reverse solver and APIs | IMPLEMENTED_AND_TESTED |
| Prompt A/B Cost Lab | Local prompt tokenization, model-by-model cost delta, monthly projection, no prompt persistence | IMPLEMENTED_AND_TESTED |
| Saved scenario history | Create/list/reopen metadata, rename, duplicate and delete through UI/API; authenticated E2E lifecycle | IMPLEMENTED_AND_TESTED |
| Historical variance/replay | Versioned scenarios, actual-vs-estimated variance and deterministic advisory/replay logic | IMPLEMENTED_AND_TESTED |

## Runs, telemetry, findings and FinOps

| Area | Release evidence | Status |
| --- | --- | --- |
| Canonical Agent Run Receipt | Runs, turns, LLM calls, tool calls, outcomes, pricing provenance and provider-native token buckets | IMPLEMENTED_AND_TESTED |
| Collector normalization | Codex, Claude Code, Cursor, Antigravity, generic hooks, durable checkpoints | IMPLEMENTED_AND_TESTED |
| Provider usage import | Preview/commit import flow, duplicate protection, persisted rows and UI | IMPLEMENTED_AND_TESTED |
| Waste/findings engine | Orientation, repeated reads, oversized output, retries, edit churn, cache blind spots, context growth, fallback premium, route evidence and outcome checks | IMPLEMENTED_AND_TESTED |
| Anomaly/FinOps engine | Deterministic anomaly detection, forecast/showback/cost-center aggregation, weekly deterministic brief | IMPLEMENTED_AND_TESTED |
| Broader live provider-admin collectors | Requires provider-specific account support/credentials beyond the launch baseline | POST_LAUNCH_ROADMAP |

## Experiments and optimization

| Area | Release evidence | Status |
| --- | --- | --- |
| Evaluation datasets | Versioned tenant-scoped metadata-only datasets + case references through UI/API | IMPLEMENTED_AND_TESTED |
| Experiment lifecycle | Create/update controlled baseline/candidate experiment, result ingestion, deterministic evaluators | IMPLEMENTED_AND_TESTED |
| Regression/savings gate | Minimum 5+5 evidence, completed status, non-inferior quality and success, strictly lower median cost | IMPLEMENTED_AND_TESTED |
| Experiment privacy | Prompt/content retention rejected; only references, hashes and economics/evaluation metadata are durable | IMPLEMENTED_AND_TESTED |
| Route Lab / optimizer | Deterministic historical cohorts, evidence-aware optimizer and route UI | IMPLEMENTED_AND_TESTED |

## Governance, gateway and teams

| Area | Release evidence | Status |
| --- | --- | --- |
| Budgets | Create/view scoped budget guardrails and deterministic policy engine | IMPLEMENTED_AND_TESTED |
| Policies | Website policy authoring for cost/turn/retry/tool/fallback rules plus policy-check API | IMPLEMENTED_AND_TESTED |
| Approval queue | Scoped approval records, UI review, approve/deny lifecycle and authenticated E2E | IMPLEMENTED_AND_TESTED |
| Teams | Real team membership/project attribution APIs and interactive manager | IMPLEMENTED_AND_TESTED |
| Signed outbound webhooks | Encrypted destinations, HMAC signing and SSRF controls | IMPLEMENTED_AND_TESTED |
| Governed gateway | OpenAI/Anthropic/Gemini execution, compatibility routes and deterministic pre-call policy/budget checks | IMPLEMENTED_AND_TESTED |
| Live upstream provider invocation | Needs a safe provider test credential for live external-call certification | IMPLEMENTED_PROVIDER_GATED |
| MCP | API-key/service-account auth, RFC 9728 metadata, WorkOS OAuth/JWT validation | IMPLEMENTED_AND_TESTED |

## Enterprise, auth and billing

| Area | Release evidence | Status |
| --- | --- | --- |
| Auth/RBAC | WorkOS/AuthKit session, callback, sign-out, tenant/RBAC and ephemeral release-test-user automation | IMPLEMENTED_PROVIDER_GATED |
| Directory lifecycle | Signed WorkOS webhook, idempotent event ledger, group/team membership lifecycle and owner protection | IMPLEMENTED_PROVIDER_GATED |
| Service accounts/API keys | Create/rotate/revoke, one-time secret display and authorization coverage | IMPLEMENTED_AND_TESTED |
| Audit/SIEM export | Audit APIs/NDJSON + signed webhook delivery foundation | IMPLEMENTED_AND_TESTED |
| Privacy controls | Metadata-only active; unsupported full-content modes fail closed | IMPLEMENTED_AND_TESTED |
| Billing | Stripe checkout, portal, webhook entitlement lifecycle and live catalog/webhook verifier | IMPLEMENTED_PROVIDER_GATED |

## Database and release controls

Current migration chain is **`0000` through `0008`**.

- CI applies the complete chain to disposable PostgreSQL and verifies schema/checksums/triggers.
- Neon validation branch `br-small-haze-aeqj7d25` is verified through `0008_workload_pricing_intelligence`.
- Neon Production branch `br-muddy-sun-aeyodc4h` intentionally remains through `0007` until certified Preview promotion.
- Runtime `/api/health` proves the actual Neon project and branch identity; a merely connectable but wrong/ephemeral database cannot pass release certification.
- Release Preview pins the persistent validation database; Production pins the Production branch.
- Production promotion is staged, certified before traffic, deployment-ID checked after promotion, and protected by automatic rollback.

## Current provider gates

These are the remaining launch gates; they are external account/runtime state, not unfinished feature code:

1. **GitHub/Vercel:** repository secret `VERCEL_TOKEN` is not configured. The Release Preview preflight therefore fails closed before deployment. Vercel CLI pull/deploy/promote requires an authorization token.
2. **Vercel Preview runtime:** the existing old Preview has a stale `DATABASE_URL`; the environment must be refreshed with the persistent validation DB, WorkOS Staging, Stripe TEST, vault and cron values.
3. **Stripe TEST:** the connected Stripe session currently exposes the live account only. Preview release certification requires TEST-mode Checkout/portal/webhook lifecycle and intentionally refuses live mode.
4. **WorkOS Production:** WorkOS reports Production `Inactive`; no billing address/default payment method is configured. Production mutations are rejected while inactive. Real billing details/payment method must activate the existing workspace first.
5. **Vercel Production runtime:** the existing stable deployment is an older artifact and lacks the launch-critical Production runtime contract. Production values are installed only after the provider prerequisites above are valid.

## Current release rule

PR #14 is the only canonical release candidate. It must remain draft and must not be promoted/merged merely because repository CI is green. Release completion requires:

1. exact-head repository CI green;
2. exact-head immutable Preview deployment and `preview_certified` manifest;
3. real WorkOS Staging AuthKit/onboarding lifecycle using ephemeral release users;
4. Stripe TEST lifecycle, MCP, database identity and zero recent Preview 5xx;
5. WorkOS Production activation and verified Production runtime configuration;
6. staged Production certification, forward-only `0008` migration, promotion and post-promotion deployment-ID equality;
7. final Production health/auth/MCP/5xx certification and release finalization.

Issue #3 remains open only for broader post-launch collector/control-plane expansion; those future phases are not release blockers for the current website.
