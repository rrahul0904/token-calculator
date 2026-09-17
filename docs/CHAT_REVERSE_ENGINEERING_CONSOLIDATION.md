# Reverse-engineering consolidation into Token Intelligence

Date: 2026-09-17

## Scope and truthfulness boundary

This document consolidates the relevant reverse-engineering threads retrievable from the recent Token Intelligence conversations and maps them to the actual repository. It does **not** claim visibility into every browser tab or chat window a user may currently have open. A reference that was not retrievable is not silently marked complete.

The work is clean-room capability analysis only. Do not copy proprietary source code, private implementation details, branding, report prose, unknown thresholds, or visual design from reference products.

## Consolidation rule

Token Intelligence is the system of record. Reuse its existing gateway, telemetry envelope, collectors, policy engine, experiments, findings, pricing, MCP, approvals, provider connections, and FinOps primitives. Do not create parallel subsystems merely because a reference product uses different naming.

## Coverage matrix

| Reference stream | Reusable capability | Token Intelligence mapping | Determination |
| --- | --- | --- | --- |
| Optimaizr | Local agent-history analysis, waste findings, rollups, overlap-safe opportunity accounting | `src/lib/optimization/local-usage-audit.ts`, `local-usage-scan.ts`, collectors, `ti audit`, `ti scan` | Implemented in PR #18, including multi-session Wave O1 |
| SupaNexus | Unified provider gateway, BYOK/provider connections, routing, spend controls, guardrails | Gateway routes/adapters, provider connections, policy/budget engine, Route Lab/optimization | Already native; no duplicate gateway added |
| SynapsCLI | Provider-neutral event stream | Canonical run/turn/LLM/tool/outcome/budget-decision telemetry schemas and ingestion | Already native; no second event bus added |
| SynapsCLI | Cache economics / cache-aware analysis | Cache read/write receipts, pricing, findings and workload economics | Already native; no second cache layer added |
| SynapsCLI | Hard runtime budgets across time/provider rounds/result size | Policy rules/check state: `maxElapsedMs`, `maxProviderRounds`, `maxResultBytes`; policy UI, API contract and CLI counters | Implemented in this consolidation slice |
| SynapsCLI | Full worker/scheduler/supervisor/memory/skills runtime | Not a Token Intelligence responsibility | Deliberately excluded rather than misrepresented as parity |
| Boomi Agentstudio | Governed agent/tool interoperability, MCP, auditability and approvals | MCP server, policy engine, approval queue, audit log, telemetry | Existing native primitives cover the reusable control-plane layer |
| Salience | Human-controlled actions, policy gates and audit trail | Approval queue, policy actions, scoped audit events | Existing native primitives; richer action-risk taxonomy remains a possible product increment |
| ForgeLab / Token Intelligence economics work | Workload economics, pricing provenance and scenario comparison | Pricing catalog/history, workload scenarios, economics endpoints, model comparisons, advisory logic and variance analysis | Already native |
| Tame-style automation references | Scheduled checks and continuous verification | Natural fit is scheduled re-verification of Token Intelligence evidence, not a generic browser-automation product | Product roadmap only; full automation product excluded |
| VoiceTutor | Provider abstraction, traces/evaluation patterns | Provider adapters, telemetry, evaluations and experiments | Reusable infrastructure already native; voice-learning UI excluded |
| AI Engineering Studio | Evaluation/provider/trace primitives | Evaluation engine, datasets, experiments, telemetry and gateway | Existing native primitives; editor/course/workbench UX excluded |

## Net-new implementation in this slice

### Hard runtime policy dimensions

Policy rule sets now support:

- `maxElapsedMs`
- `maxProviderRounds`
- `maxResultBytes`

Policy checks now accept the corresponding observed counters:

- `elapsedMs`
- `providerRounds`
- `resultBytes`

Reaching any configured ceiling produces `KILL_RUN`, matching the existing hard-cap behavior for tokens, turns, retries and tool calls. Restrictive policy composition takes the minimum configured ceiling across applicable scopes.

The fields live in the existing JSON policy rule set, so this feature does not require a database migration.

### Product surfaces

The controls are available through:

- policy schema validation and evaluation;
- `/api/v1/budgets/check` request validation;
- the Budgets & Alerts policy-authoring UI;
- `ti budget check --elapsed-ms ... --provider-rounds ... --result-bytes ...`;
- the OpenAPI contract;
- deterministic unit coverage.

### Enforcement boundary

These runtime counters are enforced when they are supplied to the policy check path. This consolidation slice does **not** claim that every gateway/streaming/provider adapter automatically derives all three counters. In particular, exact result-byte enforcement for streaming responses requires stream-aware measurement semantics before it can be described as built-in gateway enforcement.

That distinction is intentional: configurable policy capability and automatic measurement are separate evidence claims.

## Existing architecture deliberately reused

No new duplicate implementation was created for:

- provider gateway or provider credentials;
- telemetry/event bus;
- cache accounting;
- pricing engine;
- experiment/evaluation engine;
- collector registry;
- MCP server;
- approval system;
- audit log.

## Compatible follow-on increments

The following remain useful Token Intelligence product work but are not represented as already complete by this consolidation:

- automatic gateway measurement of elapsed runtime/provider rounds/result bytes where semantics are reliable, including stream-aware result sizing;
- scheduled re-verification and evidence refresh;
- versioned before/after verified-savings ledger;
- richer explain → simulate → verify → apply UX on top of the existing experiment/policy engines;
- action-risk taxonomy for approval policies;
- additional real-provider history validation when explicit test data is available.

Generic agent schedulers, long-term memory runtimes, specialized voice tutoring, course/editor workbenches and generic browser automation remain separate products unless Token Intelligence has a concrete economics/governance use case for them.

## Completion rule

A capability is marked implemented only when repository code exists and exact-head validation passes. Documentation or a reverse-engineering note alone does not qualify as implementation.
