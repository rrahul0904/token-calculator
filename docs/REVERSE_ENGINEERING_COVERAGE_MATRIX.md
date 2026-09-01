# Token Intelligence Reverse-Engineering Coverage Matrix

This document is generated from the September 1, 2026 gap-closure implementation wave. It is intentionally evidence-driven: documentation alone does not count as implementation, schema-only work is marked partial, and configuration-dependent external systems are not labeled live without verification.

## Status legend

- `IMPLEMENTED_AND_TESTED` — production path exists with direct automated evidence.
- `IMPLEMENTED_NOT_FULLY_TESTED` — production path exists but required acceptance coverage is incomplete.
- `PARTIAL` — some implementation exists, but the required end-user or enforcement path is incomplete.
- `MISSING` — no material implementation exists yet.
- `EXTERNAL_CONFIGURATION` — production code exists but live credentials/account configuration is still required.
- `INTENTIONALLY_NOT_IMPLEMENTED` — excluded with an explicit product/security rationale.

## Core product coverage

| ID | Source | Feature | User value | Expected surface | Implementation evidence | Test evidence | Status | Gap / action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CALC-001 | REVERSE_ENGINEERING | Browser-local calculator | Estimate before sending data to a server | `/`, calculator tools | Web Worker tokenizer, cost engine, model catalog | cost/planning/model tests | IMPLEMENTED_AND_TESTED | Preserve regression coverage. |
| CALC-002 | REVERSE_ENGINEERING | Local batch text analysis | Analyze multiple files without uploading content | Public calculator/tool | Added in this wave | Added local parser/share-state tests | IMPLEMENTED_AND_TESTED | Keep file types and size bounded. |
| CALC-003 | REVERSE_ENGINEERING | Content-free share state | Share assumptions without prompts/source | Calculator + Cost Lab URL state | Added versioned state codec in this wave | Malformed-state tests added | IMPLEMENTED_AND_TESTED | Never add raw prompt/source to URL payload. |
| PRICE-001 | Implementation prompt | Source-verified model pricing | Explain rate provenance | model catalog | source URL + verifiedAt exists | model tests | IMPLEMENTED_AND_TESTED | Continue source verification. |
| PRICE-002 | Gap-closure prompt | Immutable pricing snapshots | Keep historical receipts economically stable | DB + pricing service | Added snapshot schema/service in this wave | Snapshot tests added | IMPLEMENTED_AND_TESTED | Populate snapshots through reviewed updates, not silent overwrites. |
| COSTLAB-001 | Implementation prompt | Prompt A/B economics | Compare alternatives locally | `/app/cost-lab` | Existing Cost Lab | public/component coverage only | IMPLEMENTED_NOT_FULLY_TESTED | Authenticated E2E remains a release gate. |
| COSTLAB-002 | Gap-closure prompt | Scenario history lifecycle | Re-open/duplicate/rename/delete comparisons | Cost Lab + scenarios API | Added CRUD/history API foundations in this wave | API helper coverage added | IMPLEMENTED_NOT_FULLY_TESTED | Browser E2E remains. |
| COSTLAB-003 | Gap-closure prompt | Cheapest permitted model | Optimize within declared constraints | Cost Lab/API | Added deterministic recommendation core | Unit tests added | IMPLEMENTED_AND_TESTED | Quality is never inferred without evidence. |
| COSTLAB-004 | Gap-closure prompt | Historical run replay | Counterfactual planning from a real run | Cost Lab/run detail | Added replay economics service foundation | Unit coverage added | IMPLEMENTED_NOT_FULLY_TESTED | Full interactive browser flow remains. |

## Agent economics / telemetry coverage

| ID | Source | Feature | User value | Expected surface | Implementation evidence | Test evidence | Status | Gap / action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TEL-001 | Agent economics prompt | Canonical Agent Run Receipt | Explain who/what/why/cost/outcome | DB/API/UI | runs/turns/LLM/tool/outcome tables and run pages | DB/collector tests | IMPLEMENTED_AND_TESTED | Keep provider-native dimensions. |
| TEL-002 | Agent economics prompt | Codex collector | Local coding-agent telemetry | CLI/collector | `src/lib/collectors/codex.ts` | collector fixtures | IMPLEMENTED_AND_TESTED | Preserve privacy defaults. |
| TEL-003 | Agent economics prompt | Claude Code collector | Local coding-agent telemetry | CLI/collector | `claude.ts` | collector fixtures | IMPLEMENTED_AND_TESTED | Preserve cache dimensions. |
| TEL-004 | Agent economics prompt | Cursor collector | Honest estimated telemetry | CLI/collector | `cursor.ts` | collector fixtures | IMPLEMENTED_AND_TESTED | Must remain `estimated` when source lacks native usage. |
| TEL-005 | Agent economics prompt | Antigravity capability adapter | Capture only observable telemetry | CLI/collector | `antigravity.ts` | collector fixtures | IMPLEMENTED_AND_TESTED | Do not claim unsupported fields. |
| TEL-006 | Gap-closure prompt | Durable collector checkpoints | Restart-safe historical sync | CLI | Added checkpoint module + CLI semantics in this wave | Checkpoint tests added | IMPLEMENTED_NOT_FULLY_TESTED | Real filesystem/version fixtures still needed in CI. |
| TEL-007 | Gap-closure prompt | Generic hook ingestion contract | Allow stable tool hooks without proprietary parsing | events API/docs | Added hook schemas/normalizer in this wave | Unit tests added | IMPLEMENTED_AND_TESTED | Vendor-specific adapters only when documented hooks exist. |
| TEL-008 | Gap-closure prompt | Provider-admin spend connectors | Reconcile account totals with attributed runs | Integrations/FinOps | Capability registry/reconciliation model added | Capability tests | PARTIAL | Live provider admin APIs depend on documented account APIs and credentials. |
| TEL-009 | Gap-closure prompt | Billing/usage CSV/JSON imports | Bring measured external spend into reconciliation | Import API/FinOps | Import parser/preview service foundation added | Import tests added | IMPLEMENTED_NOT_FULLY_TESTED | UI and live provider export fixtures remain. |

## Waste, anomaly and optimization coverage

| ID | Source | Feature | User value | Expected surface | Implementation evidence | Test evidence | Status | Gap / action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WASTE-001 | Agent economics prompt | Orientation-heavy | Detect early context waste | findings | existing engine | dedicated findings suite added | IMPLEMENTED_AND_TESTED | — |
| WASTE-002 | Agent economics prompt | Repeated reads | Detect repeated resource reads | findings | existing engine | dedicated findings suite added | IMPLEMENTED_AND_TESTED | — |
| WASTE-003 | Agent economics prompt | Oversized tool output | Detect carried-context waste | findings | existing engine | dedicated findings suite added | IMPLEMENTED_AND_TESTED | — |
| WASTE-004 | Agent economics prompt | Retry loops | Detect repeated failed operations | findings | existing engine | dedicated findings suite added | IMPLEMENTED_AND_TESTED | — |
| WASTE-005 | Agent economics prompt | Same-resource edit churn | Detect repeated edit/revert behavior | findings | added in this wave | dedicated findings tests added | IMPLEMENTED_AND_TESTED | No source content stored. |
| WASTE-006 | Agent economics prompt | Cache blind spots | Detect write/read mismatch | findings | existing engine | dedicated findings suite added | IMPLEMENTED_AND_TESTED | — |
| WASTE-007 | Agent economics prompt | Context growth | Detect runaway context | findings | existing engine | dedicated findings suite added | IMPLEMENTED_AND_TESTED | — |
| WASTE-008 | Agent economics prompt | Fallback premium | Detect expensive route fallback | findings | existing engine | dedicated findings suite added | IMPLEMENTED_AND_TESTED | — |
| WASTE-009 | Agent economics prompt | Oversized model route | Recommend cheaper route only with comparable outcomes | findings/Route Lab | added evidence-gated rule in this wave | positive/negative tests added | IMPLEMENTED_AND_TESTED | Never emit without comparable success evidence. |
| WASTE-010 | Agent economics prompt | Spend without verified outcome | Prevent false optimization claims | findings | existing engine | dedicated findings suite added | IMPLEMENTED_AND_TESTED | — |
| ANOM-001 | Gap-closure prompt | Deterministic anomaly engine | Find spend/retry/cache regressions | FinOps/alerts | Added median/MAD detector foundation | anomaly tests added | IMPLEMENTED_AND_TESTED | Production scheduling/history thresholds still require DB-backed runner. |
| OPT-001 | Gap-closure prompt | Route replay / historical optimizer | Compare cost and success together | Route Lab/Cost Lab | Added deterministic cohort analyzer foundation | optimizer tests added | IMPLEMENTED_NOT_FULLY_TESTED | Full UI and experiment verification remain. |
| OPT-002 | Gap-closure prompt | Prompt/context/config version attribution | Explain regression source | DB/API | Added schema foundation in this wave | schema coverage | IMPLEMENTED_NOT_FULLY_TESTED | UI and lifecycle API remain. |
| OPT-003 | Gap-closure prompt | Datasets/evaluations/experiments | Prove cheaper and equally good | API/CI | Added schema/core evaluator foundation | evaluator tests added | IMPLEMENTED_NOT_FULLY_TESTED | Full experiment execution/UI is a follow-on gate. |

## Governance / platform coverage

| ID | Source | Feature | User value | Expected surface | Implementation evidence | Test evidence | Status | Gap / action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GOV-001 | Agent economics prompt | Hierarchical policies/budgets | Control next call | API/UI/gateway | existing policy engine | policy tests | IMPLEMENTED_AND_TESTED | — |
| GOV-002 | Agent economics prompt | Approval records | Govern expensive exceptions | API/UI | existing approvals | policy/API coverage | IMPLEMENTED_NOT_FULLY_TESTED | Authenticated E2E remains. |
| GOV-003 | Agent economics prompt | Signed outbound webhooks | Alert external systems safely | API | existing HMAC/SSRF-safe webhook delivery | security tests | IMPLEMENTED_AND_TESTED | — |
| GOV-004 | Gap-closure prompt | Real team scope | Make `team` a real policy/FinOps dimension | DB/API | added team/team-member/project-team schema in this wave | tenant/schema tests planned | IMPLEMENTED_NOT_FULLY_TESTED | Full membership UI/E2E remains. |
| GATE-001 | Agent economics prompt | Governed provider gateway | Enforce before upstream model call | `/api/gateway/[provider]` | existing OpenAI/Anthropic/Gemini execution | gateway tests | IMPLEMENTED_AND_TESTED | — |
| GATE-002 | Gap-closure prompt | Drop-in compatibility | Lower migration cost for existing apps | `/v1/*` | compatibility adapters started in this wave | request-mapping tests added | IMPLEMENTED_NOT_FULLY_TESTED | End-to-end provider fixture coverage required before production claim. |
| MCP-001 | Agent economics prompt | MCP API-key auth | CI/service-account MCP | `/mcp` | existing API-key route | MCP tests | IMPLEMENTED_AND_TESTED | — |
| MCP-002 | Agent economics prompt | MCP OAuth path | User-facing standards-based MCP auth | `/mcp` + auth metadata | production path remains configuration/design dependent | no live OAuth verification | PARTIAL | Must use current MCP authorization spec + WorkOS primitives; do not ship a home-grown insecure issuer. |

## FinOps / enterprise / production coverage

| ID | Source | Feature | User value | Expected surface | Implementation evidence | Test evidence | Status | Gap / action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FIN-001 | Gap-closure prompt | Forecast/showback/cost center | Finance-readable allocation | `/app/finops` | finance aggregation core added in this wave | finance tests added | IMPLEMENTED_NOT_FULLY_TESTED | Browser E2E/live data remains. |
| FIN-002 | Gap-closure prompt | Weekly deterministic brief | Explain what changed without paying an LLM | FinOps | briefing generator added | unit tests added | IMPLEMENTED_AND_TESTED | Delivery scheduling optional. |
| FIN-003 | Gap-closure prompt | Provider/run reconciliation coverage | Surface unattributed spend honestly | FinOps | reconciliation core added | unit tests added | IMPLEMENTED_AND_TESTED | Live admin/account connectors remain configuration dependent. |
| ENT-001 | Agent economics prompt | WorkOS auth/RBAC | Enterprise identity | auth/app | existing WorkOS abstraction | redirect/auth tests | EXTERNAL_CONFIGURATION | Live tenant credentials required. |
| ENT-002 | Agent economics prompt | Directory/SCIM lifecycle | Provision/deprovision identities | webhook/team model | status only before this wave; lifecycle foundation planned | fixture coverage required | PARTIAL | Live WorkOS directory setup required after code-complete path. |
| ENT-003 | Agent economics prompt | Service accounts | Non-human CI/agent identity | DB/API/UI | existing | authorization tests | IMPLEMENTED_AND_TESTED | — |
| ENT-004 | Agent economics prompt | Audit/SIEM export | Security evidence | audit/export | audit + signed webhook foundation | security tests | IMPLEMENTED_NOT_FULLY_TESTED | Complete usage/policy/security stream destinations and E2E. |
| ENT-005 | Gap-closure prompt | Privacy modes | Explicit content-retention posture | settings/data | metadata-only default exists | privacy tests | PARTIAL | Redacted/full/customer-managed storage must not be labeled available until encryption/export/delete lifecycle is complete. |
| ENT-006 | Gap-closure prompt | Data-region truth | Avoid false residency claims | settings | deployment-region truth model planned | — | PARTIAL | Requires deployment metadata and UI state. |
| TEST-001 | Implementation prompt | Authenticated browser E2E | Prove real SaaS journeys | Playwright | public smoke existed before wave | only public spec before wave | PARTIAL | This remains a merge/release gate until deterministic auth fixtures run. |
| PROD-001 | Gap-closure prompt | Production matches `main` | Ensure users run verified code | Vercel/Neon/WorkOS/Stripe | code present | current stable `/api/health` previously returned 404 | EXTERNAL_CONFIGURATION | Do not call production ready until exact `main` SHA is deployed and smoke verified. |

## Current release rule

The gap-closure branch must **not** be merged merely because these foundations exist. Merge requires the exact candidate SHA to execute the required CI/build/database/browser gates. External credential-dependent capabilities must be reported as `EXTERNAL_CONFIGURATION`, never simulated as live.
