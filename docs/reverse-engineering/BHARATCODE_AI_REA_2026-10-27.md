# BharatCode.ai — REA evidence and portfolio-deduplication record

Investigated: 2026-10-27 | Target: https://bharatcode.ai/ | Stage: RESEARCH ONLY | Contract: DRAFT / NO-GO

Canonical primary owner: rrahul0904/token-calculator (Token Intelligence), for API gateway, subscriptions, metering, model economics and telemetry.
Cross-project consumers: rrahul0904/agent-work-os (Issue #86 Local/Team Inference Gateway, RE-359 TauCode); rrahul0904/agentdock (CLI/desktop integration, RE-071); rrahul0904/codeatlas-ai for optional code context.
No new standalone product repository is justified. Historical RE394 tracker as of 2026-10-10 has no BharatCode entry; assign RE-PENDING-BHARATCODE-20261027 until canonical ID reconciliation.
REA_PROVIDER_UNAVAILABLE: used manual governed public web and GitHub inspection. No authenticated vendor account, paid API call, desktop installation, or end-to-end service verification.

## Identity and rights boundary

BharatCode.ai is a hosted flat-rate LLM API and coding-agent client ecosystem operated by Gupta Edtech Solutions Private Limited. Do not conflate it with bharatcode.dev, which presents a separate Rust-first agent under another install namespace.
Public source at https://github.com/BharatCode-ai/bharatcode-desktop describes an OpenCode-derived desktop/UI and OAuth provider. Its root LICENSE is MIT with the upstream OpenCode notice. This is NOT publication of BharatCode.ai hosted serving, auth, payment and GPU infrastructure. Before reusing any code or assets, inspect per-package provenance, transitive license and attribution requirements.

## Time-stamped evidence ledger (2026-10-27)

| ID | Class | Evidence URL | Finding | Limit |
|---|---|---|---|---|
| E-001 | OBSERVED | https://bharatcode.ai/ | Shared model capacity, utilization and queues; Chat, free student quota, paid plans. | Page observation, not a real throughput test. |
| E-002 | OBSERVED | https://bharatcode.ai/build | OpenAI-compatible /api/model/v1, GET /models, POST /responses and /chat/completions; Qwen 3.8 27B and DeepSeek V4.1 Flash; streaming, tool-call payloads, explicit model. | Published docs only; live request not sent. |
| E-003 | OBSERVED | https://bharatcode.ai/build | Responses documented as stateless; requires store:false; no hosted tools, previous_response_id, store:true or background jobs. Incomplete response/503 error semantics documented. | Contract not independently tested. |
| E-004 | OBSERVED | https://bharatcode.ai/setup | Desktop builds for Windows, macOS and Linux; npm CLI, browser-based sign-in and Homebrew. | Installed binaries not executed. |
| E-005 | OBSERVED | https://bharatcode.ai/terms | Lite INR399/month (eligible student INR299); Pro INR999/month since Oct 13, 2026; Razorpay; paid capacity is shared and fair-use constrained; free student up to 10M tokens per IST day when active. | Operational policy is stated, not audited. |
| E-006 | OBSERVED | https://github.com/BharatCode-ai/bharatcode-desktop | OpenCode-derived public Desktop repo and MIT root license; desktop OAuth configuration. | Hosted serving source not public. |
| E-007 | OBSERVED | https://github.com/BharatCode-ai/bharatcode-desktop/releases/tag/desktop-beta-1.15.46 | Oct 25 Desktop beta vendor release notes, including partial platform-specific acceptance. | Independent acceptance not performed. |
| E-008 | OBSERVED | https://github.com/rrahul0904/agent-work-os/issues/86 | Existing controlled local/team inference workstream for Codex, Claude Code and Cursor. | Issue/spec is not proof of shipped provider runtime. |
| E-009 | OBSERVED | https://github.com/rrahul0904/token-calculator | Existing owned token, model, cost and gateway/economics planning surface. | README is not full live certification. |
| E-010 | INFERRED | E-001/E-002/E-005 | A similar system needs tenant grants, capacity scheduler, model adapters and immutable usage transactions. | Original proposal, not recovered vendor backend. |
| E-011 | UNKNOWN | Login-protected/runtime areas | Exact queue fairness, GPU topology, residency, ZDR, payment reconciliation, throughput, API error rates, private backend source. | Do not invent or bypass access. |

## Nearest canonical tracker matches

| Ranking | Product / ID | Qualitative overlap | Route |
|---|---|---|---|
| 1 | Token Intelligence: RE-034 LiteLLM, RE-182 SupaNexus, RE-032 Langfuse, RE-033 Helicone | 95% estimated | PRIMARY gateway, usage, economics |
| 2 | Agent Work OS Issue #86 (Local/Team Inference Gateway) | 93% | Team GPU and provider policy |
| 3 | Agent Work OS: RE-359 TauCode | 90% | Coding-agent orchestration and routing receipts |
| 4 | AgentDock: RE-071 AgentPort and RE-361 Codetist | 85% | Desktop, CLI, agent surface |
| 5 | Token Intelligence: RE-035 thin-root DeepSeek orchestration | 80% | Low-cost model delegation |
| 6 | ForgeLab Brain | 69% | Optional IDE/multi-agent consumer |
| 7 | CodeAtlas AI: RE-051 | 52% | Code intelligence adjunct, not gateway core |

Similarity percentages are editorial capability-overlap estimates, NOT completion, coverage measurement or successful independent parity tests. rrahul0904/agentdock-platform was not accessible via connected GitHub on Oct 27; do not present it as a verified live repo.

## Clean-room feature decisions

MATCH: published compatible /models, /responses, /chat/completions, explicit model and stream semantics; multi-model entitlements; key-based access; measurable queue/capacity; desktop/CLI clients via existing owned projects.
IMPROVE: transparent queue fairness and admission receipts; non-leaking provider fallback; tenant budgets; signed model/runtime revisions; redacted immutable usage; stale and cancellation states; region residency policy; honest throughput/cost benchmarks.
NEW: ModelAccessGrant, InferenceQueueReceipt, ModelLaneManifest, tenant quota ledger, deterministic load/ordering simulator, OpenAI-compatible normalized streaming adapter; partner with Agent Work OS Issue #86 rather than fork it.
OMIT: BharatCode brand/visual assets/private code, guessing hidden endpoints, unlicensed weights, fake unlimited-performance promises, default code collection, automatic forwarding of private content to disallowed providers, false zero-retention claims.

## Architecture proposal (INFERRED, NOT discovered vendor topology)

CLI/Desktop/Agent -> Key/Auth/Tenant -> Plan & policy -> Fair queue/admission -> Model adapter -> approved local/team/hosted runtime -> compatible stream normalizer -> usage/queue/latency receipt -> Token Intelligence analytics.

## Draft Shipping Contract and acceptance

Golden journey: authorized tenant key gets entitled models, requests a response, enters a bounded fair queue, receives documented stream/error semantics and an accurate usage receipt persisted against the tenant/plan.
Phase A browser-to-API-to-durable-state-to-response slice: model list and Responses-compatible SSE with deterministic fake model; tenant-bound API-key identities; queue admission/rejection receipts; durable idempotent usage accounting; no real external API calls.
Required negative tests: invalid model/plan, cross-tenant read, unauthorized provider fallback, streamed partial output and incomplete status, provider 503, queue starvation, timeout/disconnect, retry dedupe, malformed tool-call output, revoked key, log secret leakage.
Phase B real model: use an explicitly approved locally owned or permitted team GPU runtime, validate model/tool capabilities and privacy before execution, record observed TTFT/queue/latency/cost provenance. Do not claim paid subscription throughput parity.
Phase C: approved Code/Claude/Cursor adapter semantics, desktop OAuth controls, account/plan billing webhooks with idempotent transaction reconciliation, independent privacy/ZDR proof, audited fair-use SLO.
Ownership: Token Intelligence owns the API/ledger. Agent Work OS owns agent sessions and inference grants. AgentDock owns desktop/client integration. Independent security/evaluation reviewer must certify acceptance.
Deployment constraint: production on user-owned AWS, OCI or in-house infrastructure only; never Railway, Render or Vercel. No release/publishing without authorization, runtime evidence and rollback plan.
Critical blockers: BUILDING slot/capacity, GPU/runtime target, credentials, privacy policy, rights review for bundled components, real auth/billing integration, production security/independent evaluations. Contract remains UNFROZEN and release NO-GO.

## Current execution receipt

Public website/docs: INSPECTED; public Desktop repo/LICENSE: INSPECTED; historical tracker: MATCHED; current owned project READMEs: REVIEWED; authenticated vendor E2E: NOT TESTED; agent-side gateway implementation: NOT STARTED; tests in this research-only PR: NOT RUN; production: NOT SHIPPED.

Next action: independently review this deduplication proposal and coordinate with Agent Work OS Issue #86; then implement the minimal fake-model queue/gateway vertical slice on an approved engineering branch with tests and exact-SHA receipts.
