# Agent Observability + AI FinOps Control Plane — Reverse Engineering Dossier

Research wave started: 2026-08-31

This is a clean-room product study. It extracts observable capabilities, system patterns, data models, and product lessons from public websites, documentation, articles, and open-source repositories. It does not copy proprietary source code, UI assets, copywriting, or undisclosed implementation details.

## 1. Product thesis

Token Intelligence should evolve from a pre-flight token/cost calculator into a closed-loop **AI FinOps + Agent Observability + Control Plane**.

The system should answer four questions continuously:

1. **Before a run:** What is this task likely to cost, which model should handle it, and is it inside policy?
2. **During a run:** Which turn/model/tool/retry/fallback is consuming budget, and should the run continue?
3. **After a run:** What did the spend produce, where was waste introduced, and did the task succeed?
4. **Next run:** What routing/context/prompt/policy change should reduce cost without lowering outcome quality?

The key product unit should become an **Agent Run Receipt**, not just a token total.

---

## 2. Sources studied

### Commercial / hosted products

- Faros AI — token intelligence, engineering outcome attribution, route optimization, governance
- Ramp AI Token Spend Management — provider aggregation, spend attribution, alerts, savings recommendations, router
- CostHawk — developer AI adoption, MCP telemetry, provider admin APIs, wrapped proxy keys, budgets
- PromptLayer — prompt registry, traces, evals, prompt/version linkage, agent observability
- Langfuse — traces/generations, usage buckets, cost tracking, model pricing, alerts, metrics API
- Helicone — gateway, sessions, users/properties, cost tracking, caching, alerts, reports, routing
- LangSmith — tracing/evals, team/enterprise observability and self-hosting patterns
- LiteLLM — multi-provider gateway, virtual keys, users/teams/orgs, budgets, rate limits, SSO and audit controls
- Tetrate Agent Router — gateway-enforced identity, policy, routing, failover, token budgets and OpenTelemetry
- Moesif — usage-based billing, credits, quotas, metering and monetization
- OpenRouter — native usage accounting, cached/reasoning token details, unified model/provider routing
- Prompt Cost Calculator — pre-flight prompt estimation and coding-agent impact estimates

### Developer / local tooling

- `vishbay/cram-ai`
- `kelesmert/turnlens`
- macOS token/quota monitor ecosystem summarized by DensHub

### Technical references

- OpenTelemetry GenAI semantic conventions
- Alpha Iterations LLM cost-estimation guide
- Artem Novichkov — Foundation Models token tracking
- Tetrate token-optimization guidance

---

## 3. Competitive capability matrix

| Product / source | Best observable idea | What Token Intelligence should learn |
|---|---|---|
| Faros | Trace token spend to commits, PRs and shipped outcomes | Cost alone is not ROI. Join run telemetry to engineering outcomes. |
| Ramp | Map provider/API-key spend to owner, team and project; anomaly alerts; weekly briefing | Make AI spend finance-readable without collecting prompt content. |
| CostHawk | Three ingestion paths: local MCP telemetry, admin API sync, wrapped proxy keys | Support multiple telemetry depths instead of forcing one integration. |
| cram-ai | Coding-agent waste classes and before/after optimization verification at fixed task success | Diagnose *why* tokens were spent and prove fixes do not hurt success. |
| TurnLens | Per-turn receipts for Codex/Claude with tool calls, reasoning, duration and interrupted turns | The turn is a first-class cost unit; aborted work must remain visible. |
| PromptLayer | Link production traces to exact prompt/workflow versions; regression evals and A/B tests | Join economics to configuration/version changes. |
| Langfuse | Detailed usage buckets, cost inference, pricing tiers, user/tag grouping and alerts | Build a normalized usage schema with exact provider usage winning over inference. |
| Helicone | Sessions/users/properties + gateway + caching + alerts + reports | Give teams both observability and a low-friction proxy integration. |
| Tetrate | Identity → policy/rate limit → route → retry/failover → log/trace at the gateway | Enforcement belongs inline beneath the agent, not only in dashboards. |
| LiteLLM | Virtual keys, key/user/team/org budgets, model restrictions, self-hosted gateway | Enterprise controls need hierarchical identity and budget scopes. |
| Moesif | Usage billing, prepaid credits, quotas, monetization | Product can monetize its own API/gateway with the same metering primitives. |
| OpenRouter | Per-response usage with cached/reasoning token detail and cost | Preserve provider-native usage detail; do not collapse everything to input/output. |
| Prompt Cost Calculator | Pre-flight estimate, ranges, coding-agent multiplier | Keep the free calculator as acquisition and planning surface. |
| DensHub ecosystem | Local developer quota/usage awareness | A local tray/CLI view can become a useful individual entry point later. |
| Apple Foundation Models article | Count instructions, tools, prompt and transcript separately against context size | Context pressure should be decomposed by component, not shown only as total. |

---

## 4. The strongest product pattern: estimate → trace → reconcile → control

Most products specialize in one stage:

- calculators estimate before a request;
- observability platforms trace after requests;
- finance dashboards aggregate bills;
- gateways control routing and access;
- coding-agent profilers analyze local sessions.

Token Intelligence can combine them into one loop:

```text
PRE-FLIGHT
prompt/repo/task estimate
      |
      v
POLICY CHECK
budget + model allowlist + context limit
      |
      v
RUN
agent / workflow / app
      |
      v
TELEMETRY
turns + LLM calls + tools + retries + fallbacks
      |
      v
RECONCILIATION
actual provider usage + price + outcome
      |
      v
ANALYSIS
waste + efficiency + anomaly + attribution
      |
      v
RECOMMENDATION / ENFORCEMENT
route, cache, compact, cap, approve, stop
```

This becomes the differentiated message:

> **Estimate before. Trace during. Reconcile after. Enforce next time.**

---

## 5. Canonical Agent Run Receipt

Every agent execution should receive a globally unique `run_id` at the beginning. All later telemetry should attach to it.

### Run-level record

```text
run_id
organization_id
workspace_id
project_id
environment
developer_user_id
service_account_id
agent_name
agent_vendor
agent_version
workflow_name
workflow_version
repo_id
repo_commit_sha
branch
issue_or_ticket_id
started_at
ended_at
status
termination_reason
estimated_cost_usd
actual_cost_usd
budget_limit_usd
prompt_tokens
cache_read_tokens
cache_write_tokens
reasoning_tokens
completion_tokens
tool_call_count
retry_count
fallback_count
turn_count
final_artifact_type
final_artifact_reference
outcome_status
outcome_score
metadata
```

### Turn receipt

```text
turn_id
run_id
turn_index
started_at
ended_at
status                 # completed / aborted / compacted / failed
user_input_hash         # optional, content-free identity
model_requested
model_resolved
reasoning_effort
input_tokens
cache_read_tokens
cache_write_tokens
reasoning_tokens
output_tokens
cost_usd
tool_call_count
retry_count
fallback_count
latency_ms
time_to_first_token_ms
context_tokens_before
context_tokens_after
context_utilization_pct
```

### LLM call receipt

```text
llm_call_id
run_id
turn_id
provider
model_requested
model_resolved
provider_request_id
input_tokens
cache_read_tokens
cache_write_tokens
audio_input_tokens
reasoning_tokens
output_tokens
cost_usd
pricing_version
service_tier
latency_ms
time_to_first_token_ms
status_code
attempt_index
fallback_from_call_id
```

### Tool call receipt

```text
tool_call_id
run_id
turn_id
parent_llm_call_id
tool_name
tool_category           # shell / filesystem / search / MCP / browser / database / other
started_at
ended_at
status
attempt_index
input_size_bytes
output_size_bytes
output_tokens_estimated
is_retry
is_repeated_call
error_class
```

### Budget decision receipt

```text
budget_decision_id
run_id
scope_type              # run / user / project / team / org / key / agent
scope_id
policy_id
decision                # allow / warn / require_approval / block / kill
current_spend_usd
projected_spend_usd
budget_limit_usd
reason
created_at
```

### Outcome receipt

```text
outcome_id
run_id
outcome_type             # PR / commit / deployment / ticket / document / answer / test run
external_id
status
quality_score
accepted
merged
shipped
reverted
human_review_required
created_at
```

This schema is the foundation for a real control plane.

---

## 6. Ingestion architecture: six paths

Token Intelligence should not depend on a single telemetry mechanism.

### A. Local agent collector

Purpose: Codex, Claude Code, Cursor, Gemini CLI/Antigravity and other developer tools.

Pattern learned from cram-ai, TurnLens and CostHawk:

- read supported local transcript/event directories;
- parse locally;
- calculate safe metadata locally;
- upload metadata only by default;
- maintain an ingestion cursor so the same event is not uploaded twice;
- clearly separate measured token counts from inferred estimates.

Initial collector command:

```bash
ti connect
nti sync --dry-run
nti sync
nti watch
```

### B. Agent hooks / plugins

Where supported, install a stop/turn/session hook that emits a receipt as soon as a turn closes. This gives lower latency than periodic transcript ingestion.

### C. Provider admin API connectors

Use organization/provider billing APIs for reconciliation:

- OpenAI
- Anthropic
- Gemini / Google
- Cursor
- Azure OpenAI
- Bedrock
- Vertex

These feeds are ideal for total spend but often lack enough agent-level attribution, so they should reconcile—not replace—run telemetry.

### D. Gateway / wrapped proxy

An OpenAI-compatible endpoint becomes the authoritative enforcement layer:

```text
/v1/chat/completions
/v1/responses
/v1/messages-compatible
```

The gateway should:

1. resolve virtual key → user/team/project/agent;
2. evaluate budget and model policy;
3. select route/provider;
4. forward;
5. retry/fail over according to policy;
6. capture provider-native usage;
7. emit OTEL + run receipt events;
8. enforce hard limits when configured.

### E. SDK / OpenTelemetry

Offer TypeScript, Python and OTLP ingestion for apps that already have tracing.

OpenTelemetry GenAI semantic conventions should influence the public telemetry schema so customers can bring existing traces without rewriting instrumentation.

### F. Billing / usage import

CSV/API import should exist for vendors where no admin connector is available. Imported spend can be reconciled to projects/keys even when request-level detail is absent.

---

## 7. Waste taxonomy for agentic systems

A major differentiator should be explaining **why** spend happened.

### Context waste

- repeated repo orientation
- repeated file reads
- irrelevant context loaded
- stale conversation history
- oversized tool output carried through later turns
- cache creation with little/no reuse
- duplicated system/tool instructions

### Control-flow waste

- retry loops
- repeated failed commands
- repeated edits to same file
- repeated test failures with no strategy change
- recursive sub-agent loops
- runaway tool-call loops
- agent stalled without producing an artifact

### Routing waste

- expensive frontier model used for low-complexity work
- fallback escalated to a model priced far above baseline
- high reasoning tier used where lower tier succeeds
- provider route selected despite materially cheaper equivalent

### Outcome waste

- run produced no artifact
- artifact failed tests
- PR never opened
- PR rejected or abandoned
- generated change reverted quickly
- human had to redo most of the work

Every finding should have:

```text
finding_type
evidence
estimated_waste_usd
confidence
recommended_fix
verification_method
```

Borrow the principle from cram-ai: **a cost optimization is not a win unless task success is preserved.**

---

## 8. Metrics that matter

### Basic spend metrics

- total cost
- tokens by input/cache-read/cache-write/reasoning/output
- cost by provider/model
- cost by project/team/user/agent/workflow
- effective cost per million tokens

### Agent-run metrics

- cost per run
- cost per successful run
- cost per failed run
- cost per tool call
- cost before first meaningful action/edit
- turns per run
- retry rate
- fallback rate
- fallback premium
- tool-call loop rate
- aborted-run cost

### Context efficiency

- context utilization
- cache hit/read share
- cache reuse ratio
- repeated-read rate
- carried-output cost
- orientation share
- prompt/tool definition overhead

### Engineering outcomes

- cost per accepted PR
- cost per merged PR
- cost per shipped change
- cost per resolved ticket
- tokens per accepted line/change (diagnostic only, not a quality KPI)
- AI spend vs cycle-time improvement
- AI spend vs rework/revert rate

### Quality-normalized efficiency

The north-star metric should be closer to:

```text
verified outcome value / AI cost
```

not simply:

```text
fewer tokens
```

---

## 9. Budget + control engine

The control plane should support hierarchical limits.

### Scopes

- run
- agent
- workflow
- API key
- user/developer
- project
- team
- environment
- organization

### Policies

- per-run USD cap
- daily/monthly project budget
- token cap
- max turns
- max retries
- max tool calls
- max fallback premium
- allowed/blocked models
- approved providers
- context utilization threshold
- approval before expensive model/fallback
- rate limits (RPM/TPM)

### Actions

```text
ALLOW
WARN
NOTIFY
REQUIRE_APPROVAL
DOWNGRADE_ROUTE
DISABLE_FALLBACK
BLOCK_NEXT_CALL
KILL_RUN
```

A budget dashboard alone is insufficient. Hard enforcement requires a gateway/hook execution path.

---

## 10. Privacy architecture

Metadata-only should be the default enterprise mode.

### Store by default

- token counts
- model/provider
- timing
- cost
- status
- tool names/categories
- retries/fallbacks
- user/team/project identifiers
- hashed repository/project identifiers where appropriate
- external outcome IDs

### Do not store by default

- prompt text
- response text
- source code
- file contents
- shell output
- secrets

### Optional content modes

1. `metadata_only` — default
2. `redacted_content` — customer-defined redaction then retention
3. `full_content` — explicit opt-in for debugging/evals
4. `customer_managed_storage` — enterprise traces remain in customer environment

The UI should show exactly which mode is active.

---

## 11. Product surfaces

### Individual / developer

- local CLI
- per-turn live meter
- daily/week/month usage
- project usage
- context pressure
- waste findings
- before/after optimization comparison

### Engineering manager

- team adoption
- spend by developer/project/agent
- run efficiency
- failure/retry hotspots
- expensive fallbacks
- model mix
- savings opportunities

### Platform / AI engineering

- gateway routes
- virtual keys
- budgets
- model policies
- provider reliability
- cache efficiency
- OTEL export
- audit logs

### Finance

- spend by cost center
- forecast
- anomaly detection
- showback / chargeback
- weekly executive briefing
- committed/subscription vs metered comparison

### Enterprise admin

- organizations/workspaces
- SSO / SCIM
- RBAC
- service accounts
- key lifecycle
- retention policies
- data-region controls
- SIEM exports
- audit logs

---

## 12. SaaS packaging implications

The existing calculator should stay free and become the acquisition surface.

### Free

- calculator
- current model pricing
- context planning
- local one-project usage summary

### Pro

- saved projects/history
- personal agent collector
- run receipts
- optimization findings
- exports
- personal MCP/API

### Team

- shared workspace
- team/project attribution
- budgets + alerts
- API keys
- provider admin connectors
- team dashboards
- Slack/email reports

### Enterprise

- gateway
- SSO/SCIM
- RBAC
- policy engine
- audit/SIEM
- dedicated/private deployment
- customer-managed retention
- SLA/support

Usage-based billing primitives from Moesif/LiteLLM-style systems can later meter Token Intelligence's own API/gateway usage, but subscription pricing should remain understandable.

---

## 13. Recommended implementation sequence

### Wave A — Run receipt foundation

Build first:

- canonical schema
- Postgres migrations
- `/v1/runs`
- `/v1/runs/{id}/turns`
- `/v1/usage/events`
- idempotency keys
- pricing reconciliation
- content-retention flags
- project/team/user metadata

### Wave B — Local coding-agent telemetry

Support:

1. Codex
2. Claude Code
3. Cursor
4. Gemini CLI / Antigravity where local telemetry is available

Deliver:

- `ti` CLI
- dry-run preview
- local parsers
- live watch
- run/turn receipts
- JSON export
- privacy controls

### Wave C — Observability UI

Build:

- overview
- runs
- run waterfall
- turns
- tool calls
- cost by project/user/model
- retry/fallback analysis
- context/cache dashboard
- anomalies

### Wave D — Budget/control engine

- policy model
- run/project/team/org budgets
- alerts
- approval flow
- max retry/tool-call/turn controls
- kill switch

### Wave E — Gateway

- OpenAI-compatible route
- provider adapters
- virtual keys
- attribution
- routing/fallback
- budgets/rate limits
- OTEL
- BYOK

### Wave F — Outcome attribution

Connect:

- GitHub commits/PRs
- Jira/Linear tickets
- CI/test results
- deployments

Then calculate cost per verified outcome and route recommendations from real historical work.

---

## 14. What not to build yet

Do not prematurely build:

- a giant prompt-management CMS;
- full eval platform parity with PromptLayer/LangSmith;
- enterprise on-prem control plane before core telemetry works;
- opaque ML "efficiency scores" without explainable evidence;
- hard gateway blocking before identity/attribution is correct;
- content capture as the default.

First win the narrow loop:

> **run identity → accurate receipt → waste explanation → budget → verified outcome**

---

## 15. Strategic differentiation

There is already strong competition in generic LLM observability and gateways. The wedge should be narrower and more actionable:

### Token Intelligence = Agent Economics Control Plane

It combines:

1. **Pre-flight economics** — current calculator / Cost Lab
2. **Developer-agent receipts** — Codex/Claude/Cursor/Antigravity attribution
3. **Waste diagnosis** — context, retries, loops, tools, fallback premium
4. **Outcome attribution** — commit/PR/ticket/deployment linkage
5. **Optimization verification** — prove savings at equal success/quality
6. **Inline policy** — budgets, model controls, kill switches through gateway/hooks

The most defensible enterprise question becomes:

> **What did this AI run cost, what did it produce, where did it waste money, and why did policy allow it?**

That is a much stronger product than a token calculator or a billing dashboard.