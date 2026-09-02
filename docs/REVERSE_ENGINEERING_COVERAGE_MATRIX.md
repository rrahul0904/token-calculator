# Token Intelligence Reverse-Engineering Coverage Matrix

This document tracks the September 2026 gap-closure wave. It is intentionally evidence-driven: documentation alone does not count as implementation, schema-only work is partial, and configuration-dependent external systems are not labeled live without runtime verification.

## Status legend

- `IMPLEMENTED_AND_TESTED` — production path exists with direct automated evidence.
- `IMPLEMENTED_NOT_FULLY_TESTED` — production path exists but a required acceptance journey is incomplete.
- `PARTIAL` — some implementation exists, but the required user/enforcement path is incomplete.
- `MISSING` — no material implementation exists yet.
- `EXTERNAL_CONFIGURATION` — production code exists but live credentials/account configuration is still required.
- `INTENTIONALLY_NOT_IMPLEMENTED` — excluded with an explicit product/security rationale.

## Core product coverage

| ID | Feature | Implementation evidence | Test evidence | Status | Remaining action |
| --- | --- | --- | --- | --- | --- |
| CALC-001 | Browser-local calculator | Web Worker tokenizer, cost engine, model catalog | cost/planning/model tests | IMPLEMENTED_AND_TESTED | Preserve regression coverage. |
| CALC-002 | Local batch text analysis | bounded browser-local text-like file analyzer | parser/share-state tests | IMPLEMENTED_AND_TESTED | Keep file types/size bounded. |
| CALC-003 | Content-free share state | versioned share codec | malformed-state tests | IMPLEMENTED_AND_TESTED | Never add raw prompt/source to URLs. |
| PRICE-001 | Source-verified model pricing | source URLs + verified timestamps | model tests | IMPLEMENTED_AND_TESTED | Continue reviewed source verification. |
| PRICE-002 | Immutable pricing snapshots | pricing snapshot schema/service | snapshot tests | IMPLEMENTED_AND_TESTED | Populate via reviewed updates, not silent overwrite. |
| COSTLAB-001 | Prompt A/B economics | Cost Lab | component/economics coverage | IMPLEMENTED_NOT_FULLY_TESTED | Real Preview authenticated E2E still external-gated. |
| COSTLAB-002 | Scenario history lifecycle | CRUD/history APIs | API/OpenAPI + metadata privacy tests | IMPLEMENTED_NOT_FULLY_TESTED | Add complete interactive Preview journey. |
| COSTLAB-003 | Cheapest permitted model | deterministic constrained recommendation core | unit tests | IMPLEMENTED_AND_TESTED | Never infer quality without evidence. |
| COSTLAB-004 | Historical run replay | counterfactual economics service | unit tests | IMPLEMENTED_NOT_FULLY_TESTED | Full interactive workflow remains. |

## Agent economics / telemetry coverage

| ID | Feature | Implementation evidence | Test evidence | Status | Remaining action |
| --- | --- | --- | --- | --- | --- |
| TEL-001 | Canonical Agent Run Receipt | runs/turns/LLM/tool/outcome schema + UI/API | DB/collector tests | IMPLEMENTED_AND_TESTED | Preserve provider-native token classes. |
| TEL-002 | Codex collector | `src/lib/collectors/codex.ts` | fixtures | IMPLEMENTED_AND_TESTED | Preserve privacy defaults. |
| TEL-003 | Claude Code collector | Claude collector | fixtures | IMPLEMENTED_AND_TESTED | Preserve cache/thinking dimensions. |
| TEL-004 | Cursor collector | Cursor collector | fixtures | IMPLEMENTED_AND_TESTED | Keep inferred usage `estimated`. |
| TEL-005 | Antigravity adapter | capability-aware collector | fixtures | IMPLEMENTED_AND_TESTED | Never claim unavailable telemetry. |
| TEL-006 | Durable collector checkpoints | local checkpoint/sync module | checkpoint tests | IMPLEMENTED_NOT_FULLY_TESTED | More real filesystem/version fixtures useful. |
| TEL-007 | Generic hook ingestion | hook schemas/normalizer | unit tests | IMPLEMENTED_AND_TESTED | Add vendor adapters only for documented hooks. |
| TEL-008 | Provider-admin spend connectors | capability registry/reconciliation model | capability tests | PARTIAL | Live account APIs depend on provider support/credentials. |
| TEL-009 | Billing/usage CSV/JSON imports | preview/commit API + row persistence + duplicate checks | parser/import tests + DB schema verification | IMPLEMENTED_NOT_FULLY_TESTED | Real provider export fixtures/UI remain. |

## Waste, anomaly and optimization coverage

| ID | Feature | Implementation evidence | Test evidence | Status | Remaining action |
| --- | --- | --- | --- | --- | --- |
| WASTE-001 | Orientation-heavy | findings engine | dedicated findings suite | IMPLEMENTED_AND_TESTED | — |
| WASTE-002 | Repeated reads | findings engine | dedicated findings suite | IMPLEMENTED_AND_TESTED | — |
| WASTE-003 | Oversized tool output | findings engine | dedicated findings suite | IMPLEMENTED_AND_TESTED | — |
| WASTE-004 | Retry loops | findings engine | dedicated findings suite | IMPLEMENTED_AND_TESTED | — |
| WASTE-005 | Same-resource edit churn | evidence-gated rule | positive/negative/edge tests | IMPLEMENTED_AND_TESTED | No source content stored. |
| WASTE-006 | Cache blind spots | findings engine | dedicated findings suite | IMPLEMENTED_AND_TESTED | — |
| WASTE-007 | Context growth | findings engine | dedicated findings suite | IMPLEMENTED_AND_TESTED | — |
| WASTE-008 | Fallback premium | findings engine | dedicated findings suite | IMPLEMENTED_AND_TESTED | — |
| WASTE-009 | Oversized model route | outcome-comparable evidence-gated rule | positive/negative tests | IMPLEMENTED_AND_TESTED | Never emit without comparable success evidence. |
| WASTE-010 | Spend without verified outcome | findings engine | dedicated findings suite | IMPLEMENTED_AND_TESTED | — |
| ANOM-001 | Deterministic anomaly engine | median/MAD detector + FinOps model | anomaly tests | IMPLEMENTED_AND_TESTED | Production scheduling/history requires live DB. |
| OPT-001 | Route replay / historical optimizer | deterministic cohort analyzer | optimizer null/unknown/evidence tests | IMPLEMENTED_NOT_FULLY_TESTED | Full UI/experiment verification remains. |
| OPT-002 | Prompt/context/config attribution | DB schema + run attribution foundation | migration/schema verification | IMPLEMENTED_NOT_FULLY_TESTED | UI/lifecycle APIs remain. |
| OPT-003 | Datasets/evaluations/experiments | schema/core evaluators | evaluator tests | IMPLEMENTED_NOT_FULLY_TESTED | Full execution/UI remains. |

## Governance / gateway / MCP coverage

| ID | Feature | Implementation evidence | Test evidence | Status | Remaining action |
| --- | --- | --- | --- | --- | --- |
| GOV-001 | Hierarchical policies/budgets | authoritative policy engine | policy tests | IMPLEMENTED_AND_TESTED | — |
| GOV-002 | Approval records | scoped GET/POST/PATCH API | policy/API + OpenAPI contract | IMPLEMENTED_NOT_FULLY_TESTED | Full Preview approval journey remains. |
| GOV-003 | Signed outbound webhooks | encrypted destination + HMAC + SSRF protection | security tests | IMPLEMENTED_AND_TESTED | — |
| GOV-004 | Real team scope | teams/team-members/project-team schema + APIs | tenant triggers/schema tests | IMPLEMENTED_NOT_FULLY_TESTED | Full team browser lifecycle remains. |
| GATE-001 | Governed provider gateway | OpenAI/Anthropic/Gemini authoritative execution | provider/gateway tests | IMPLEMENTED_AND_TESTED | Live provider call requires a safe test credential. |
| GATE-002 | Drop-in compatibility | `/v1/responses`, `/v1/chat/completions`, `/v1/messages` route adapters into authoritative gateway | request-mapping/provider tests + OpenAPI contract | IMPLEMENTED_NOT_FULLY_TESTED | Real Preview upstream fixture/live credential test remains. |
| MCP-001 | MCP API-key auth | `/mcp` API-key/service-account auth | MCP tests | IMPLEMENTED_AND_TESTED | — |
| MCP-002 | MCP OAuth path | RFC 9728 protected-resource discovery + WorkOS/AuthKit JWT resource validation | signature/audience/expiry/scope/tenant tests + OpenAPI contract | IMPLEMENTED_AND_TESTED | Live WorkOS Preview OAuth round trip is EXTERNAL_CONFIGURATION, not missing code. |

## FinOps / enterprise / production coverage

| ID | Feature | Implementation evidence | Test evidence | Status | Remaining action |
| --- | --- | --- | --- | --- | --- |
| FIN-001 | Forecast/showback/cost center | `/app/finops` aggregation + cost-center model | finance tests | IMPLEMENTED_NOT_FULLY_TESTED | Real Preview data/browser evidence remains. |
| FIN-002 | Weekly deterministic brief | briefing generator | unit tests | IMPLEMENTED_AND_TESTED | Scheduled delivery optional. |
| FIN-003 | Provider/run reconciliation coverage | reconciliation core/import attribution | unit tests | IMPLEMENTED_AND_TESTED | Live provider admin connectors remain configuration-dependent. |
| ENT-001 | WorkOS auth/RBAC | AuthKit session/tenant/RBAC implementation | redirect/auth/unit coverage | EXTERNAL_CONFIGURATION | Active gap-closure Preview lacks branch-scoped WorkOS variables; prior release Preview proved auth can be live. |
| ENT-002 | Directory/SCIM lifecycle | signed WorkOS webhook + event ledger + user/group mappings + group→team lifecycle + least privilege + owner protection | DB integration covers idempotency, provisioning, membership, owner protection, cross-tenant replay | IMPLEMENTED_AND_TESTED | Real Directory connection/event delivery remains EXTERNAL_CONFIGURATION. |
| ENT-003 | Service accounts | DB/API/UI | authorization tests | IMPLEMENTED_AND_TESTED | — |
| ENT-004 | Audit/SIEM export | audit APIs/NDJSON + signed webhook foundation | security tests | IMPLEMENTED_NOT_FULLY_TESTED | Vendor-specific SIEM destinations optional. |
| ENT-005 | Privacy modes | audited `organization_data_controls`; metadata-only active; unsupported content modes explicitly unavailable | authenticated E2E rejects `full_content` and preserves metadata-only | IMPLEMENTED_AND_TESTED | Redacted/full/customer-managed storage intentionally unavailable until lifecycle guarantees exist. |
| ENT-006 | Data-region truth | requested/configured/deployment region state and verified-only-on-match claim | authenticated E2E prevents fake verified residency | IMPLEMENTED_AND_TESTED | Real deployed region evidence required for a live residency claim. |
| TEST-001 | Authenticated browser E2E | explicitly gated CI-only auth adapter + disposable seeded tenant | project lifecycle, API key one-time secret/rotate/revoke, cross-tenant isolation, privacy, retention, workspace desktop/mobile suite | IMPLEMENTED_NOT_FULLY_TESTED | Exact current head CI must finish green; real WorkOS Preview login remains separate. |
| PROD-001 | Production matches verified main | Git-linked Vercel project and exact-SHA Preview deployments exist | Preview health/runtime inspection | EXTERNAL_CONFIGURATION | Active Preview has no real DATABASE_URL and lacks branch-scoped WorkOS/Stripe/vault values; do not merge/promote yet. |

## Database verification

The release gate now requires all current migrations (`0000` through `0006`), 48 required tables, the quota-metering trigger, and critical cross-tenant reference triggers. A migration file existing in Git is not accepted as evidence that a deployed Neon database has been migrated.

## Current release rule

PR #6 remains draft. The gap-closure branch must **not** be merged merely because source and CI foundations exist. Merge requires an exact-candidate green CI run plus the runtime gates defined by the production-release plan: real Preview database/migrations, WorkOS sign-in, tenant/API-key/MCP/retention verification, billing test-mode verification when release-scoped, Vercel Git/main mapping, Production environment preparation, and rollback planning. External credential-dependent capabilities are reported as `EXTERNAL_CONFIGURATION`, never simulated as live.
