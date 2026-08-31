# Codex Master Implementation Prompt — Token Intelligence Agent Economics Platform

## Production Waves 2–5: SaaS Foundation, Agent Run Receipts, MCP/SDK Integrations, AI FinOps Gateway, Subscriptions, and Enterprise Controls

You are continuing implementation in the existing repository:

- Repository: `rrahul0904/token-calculator`
- Current production product name: **Token Intelligence**
- Existing production foundation branch: `implementation-v1`
- Research branch that contains the latest production foundation plus the observability/control-plane dossier: `observability-control-research`
- Existing implementation PR: #2
- Existing research PR: #4
- Existing implementation-tracking issue: #3

This is **not a greenfield project**.

Do not create a new application.
Do not replace the existing calculator with an unrelated dashboard.
Do not delete working Wave 1 / Wave 1B functionality.
Do not copy proprietary source code, visual assets, branding, or copy from reference products.
Do not merge PR #2 or PR #4 unless explicitly instructed by the repository owner.
Do not force-push or rewrite existing branch history.

The current application already has a production-calculator foundation and clean-room competitive-parity work. Preserve and productionize it.

---

# 0. Mission

Evolve Token Intelligence from:

> “How many tokens does this prompt use and what will it cost?”

into:

> **“What will this AI workload cost, what did each agent run actually spend, what produced that spend, where was waste introduced, and what policy should control the next run?”**

The product is an **AI FinOps + ContextOps + Agent Observability + Control Plane**.

The closed-loop product model is:

```text
ESTIMATE
   ↓
TRACE
   ↓
RECONCILE
   ↓
CONTROL
   ↓
OPTIMIZE
   ↓
VERIFY OUTCOME
```

Product language:

> **Estimate before. Trace during. Reconcile after. Enforce next time.**

The primary unit of observability must become an **Agent Run Receipt**, not simply a monthly token total.

---

# 1. Read first — mandatory repository inspection

Before modifying any code:

1. Fetch the latest remote state.
2. Inspect the full repository tree.
3. Read at minimum:
   - `README.md`
   - `IMPLEMENTATION_PLAN.md`
   - `COMPETITIVE_PARITY.md`
   - `DEPLOYMENT.md`
   - `AGENT_OBSERVABILITY_CONTROL_REVERSE_ENGINEERING.md`
   - `package.json`
   - `.github/workflows/ci.yml`
   - all files under `src/app`
   - all files under `src/components`
   - `src/lib/models.ts`
   - `src/lib/cost.ts`
   - tokenizer worker/types
   - all current tests
4. Inspect PR #2, PR #4, and issue #3 if GitHub access is available.
5. Confirm what already exists before adding anything.

The repository currently contains or is expected to contain clean-room implementations of:

- browser-local tokenization
- token-piece visualization
- word / character / no-space-character counts
- model pricing catalog
- OpenAI / Anthropic / Gemini / xAI / DeepSeek coverage
- context-window planning
- long-context pricing tiers
- input / cache / output cost calculation
- monthly spend projection
- Cost Lab
- tokens ↔ words tool
- GPU RAM / VRAM tool
- token speed + TTFT simulator
- `/api/v1/tokenize`
- developer docs
- `/models`
- `/pricing`
- theme support
- Free / Pro / Team / Enterprise packaging concept

Do not regress these features.

---

# 2. Branching and delivery model

Start from the **latest** `observability-control-research` branch because it contains the current product foundation plus the research dossier.

Create or continue this implementation branch:

`production-wave-2-agent-economics`

If that branch already exists, inspect it before changing anything and continue from its latest valid state.

The implementation is intentionally large. Execute it as sequential internal production gates on the same branch. Every gate must leave the repository buildable and testable.

Use focused commits. Suggested commit boundaries:

1. `refactor: establish commercial app shell and design system`
2. `feat: add postgres schema auth organizations and projects`
3. `feat: add stripe subscriptions entitlements and api keys`
4. `feat: add canonical agent run receipt ingestion`
5. `feat: add codex and claude local telemetry collectors`
6. `feat: add run observability and waste analysis`
7. `feat: add budgets policy engine and alerts`
8. `feat: add authenticated mcp api sdk and cli surfaces`
9. `feat: add governed llm gateway and usage reconciliation`
10. `feat: add github outcome attribution and enterprise controls`
11. `test: harden integration e2e security and regression coverage`
12. `docs: finalize production operations deployment and enterprise docs`

Do not create empty placeholder commits merely to match this list.

---

# 3. Non-negotiable product principles

## 3.1 Free calculator remains free

The public calculator is the acquisition surface. Do not require sign-in to use the core calculator, model pricing table, or basic planning tools.

## 3.2 Metadata-first privacy

Default behavior:

```text
Prompt content       NOT STORED
Source code          NOT STORED
Secrets              NOT STORED
Raw tool output      NOT STORED
```

Store by default:

```text
token counts
provider
model
pricing version
cost
project
user/service identity
timestamps
latency
run/turn IDs
tool names/categories
retry/fallback metadata
policy decisions
status/outcome metadata
```

When content retention is ever enabled, it must be explicit, organization-configurable, encrypted, auditable, and disabled by default.

## 3.3 Honest telemetry

Never label inferred data as measured.

Every token/cost value must have a source classification such as:

- `provider_measured`
- `agent_measured`
- `local_tokenizer_reference`
- `estimated`
- `reconciled`

Unknown cost is not `$0`.

## 3.4 Outcome quality matters more than token reduction

Do not call an optimization successful merely because it uses fewer tokens.

A savings recommendation should be considered verified only when the compared run preserves or improves the relevant success/outcome signal.

## 3.5 MCP is advisory; gateway enforcement is authoritative

Do not claim MCP automatically observes all model calls.

MCP can estimate, recommend, retrieve telemetry, record explicit usage, and check policies.

Automatic hard enforcement belongs in a supported gateway/proxy/provider integration path.

## 3.6 Do not fake external systems

If Stripe, WorkOS, provider credentials, Redis, GitHub App credentials, or other external configuration are absent:

- implement the real production integration paths;
- add deterministic tests/mocks around them;
- expose clear “not configured” states;
- document exact required environment variables;
- do not fabricate successful payments, SSO, provider usage, or enterprise connections.

---

# 4. Target architecture

Preserve the existing Next.js application and evolve it rather than rebuilding it from scratch.

Target architecture:

```text
                           TOKEN INTELLIGENCE
                                   │
             ┌─────────────────────┴──────────────────────┐
             │                                            │
      Public + SaaS Web App                       Integration Layer
             │                                            │
   ┌─────────┴────────────┐                 ┌─────────────┴─────────────┐
   │ Calculator           │                 │ MCP Server               │
   │ Cost Lab             │                 │ REST API                 │
   │ Usage                │                 │ TypeScript SDK           │
   │ Agent Runs           │                 │ Python SDK               │
   │ Projects             │                 │ CLI                      │
   │ Budgets              │                 │ Agent Collectors         │
   │ Billing              │                 │ GitHub / CI integrations │
   │ Enterprise Admin     │                 │ AI Gateway               │
   └─────────┬────────────┘                 └─────────────┬─────────────┘
             │                                            │
             └──────────────────────┬─────────────────────┘
                                    │
                         Usage + Policy Engine
                                    │
                  ┌─────────────────┼──────────────────┐
                  │                 │                  │
               OpenAI           Anthropic           Gemini
               Azure            Bedrock             Vertex
               xAI              DeepSeek            Others
```

Prefer a modular monolith for the current phase.

Do **not** introduce microservices merely because the final architecture could support them.

Keep the root Next.js application intact. Add distributable `packages/` only when justified for SDK/CLI reuse. Do not move the whole web app into a new monorepo layout unless a concrete build/deployment need requires it.

---

# 5. Technical stack

Use the existing stack as the baseline:

- Next.js 16 App Router
- React 19
- TypeScript
- Vitest
- Vercel deployment

Add production dependencies only when justified.

Preferred additions:

- PostgreSQL using a standard `DATABASE_URL`
- Drizzle ORM + committed SQL migrations
- WorkOS AuthKit / organization identity adapter for authentication and enterprise identity, implemented behind a small internal auth abstraction so the application is testable without live WorkOS credentials
- Stripe Billing for subscriptions, Checkout, webhooks, and customer portal
- Model Context Protocol SDK using current **Streamable HTTP** transport for remote MCP
- OpenTelemetry-compatible GenAI telemetry mappings
- Redis only where it is materially required for high-frequency gateway rate limits / distributed coordination; do not add Redis simply for CRUD state

If implementation discovers a materially better maintained library, document the reason before substituting it.

Do not introduce Supabase, Firebase, Kafka, Kubernetes, Dockerized microservices, or a queue system merely for architecture theater.

---

# 6. UI / UX redesign — mandatory

The current engineering-MVP visual system is not the commercial UI. Redesign it substantially while preserving functionality.

## 6.1 Public experience

Target navigation:

```text
Token Intelligence | Calculator | Models | Tools | Pricing | Developers | Sign in
```

The public home page should communicate one clear promise:

> Know what your AI workload costs before it runs.

The main calculator should be visually dominant, simple, and immediately usable.

Avoid a wall of repeated provider cards.

Use a compact model comparison summary and move detailed analysis into Cost Lab / model pages.

Public routes should include or preserve:

- `/`
- `/calculator` or the equivalent calculator section
- `/models`
- `/pricing`
- `/developers`
- `/tools/cost`
- `/tools/tokens-words`
- `/tools/memory`
- `/tools/speed`

## 6.2 Authenticated application

Create a serious SaaS workspace shell with a left navigation on desktop and responsive navigation on small screens.

Target authenticated navigation:

```text
Overview
Cost Lab
Usage
Agent Runs
Projects
Integrations
Budgets & Alerts
Team
API Keys
Billing
Settings
```

Suggested routes:

- `/app/overview`
- `/app/cost-lab`
- `/app/usage`
- `/app/runs`
- `/app/runs/[runId]`
- `/app/projects`
- `/app/projects/[projectId]`
- `/app/integrations`
- `/app/budgets`
- `/app/team`
- `/app/api-keys`
- `/app/billing`
- `/app/settings`

Use route groups/layouts where helpful.

## 6.3 Visual direction

Aim for the clarity and information discipline associated with strong modern developer products, without cloning any specific product.

Requirements:

- neutral, professional palette;
- one restrained accent color;
- light and dark themes;
- consistent 8px spacing rhythm;
- clear typography hierarchy;
- dense tables where appropriate;
- accessible charts and legends;
- color communicates state/severity rather than decoration;
- no unnecessary gradients or ornamental cards;
- strong empty/loading/error states;
- keyboard navigability;
- WCAG-conscious contrast;
- responsive layout;
- no hardcoded fake production metrics.

Demo/sample data may exist only in explicit local/demo fixtures, never masquerading as production telemetry.

---

# 7. SaaS foundation

Implement real application persistence.

## 7.1 Database schema

Create migrations for at least these domains.

### Identity / tenancy

- `users`
- `organizations`
- `organization_members`
- `service_accounts`

### Product

- `projects`
- `saved_scenarios`
- `prompt_comparisons`

### Billing / entitlements

- `billing_customers`
- `subscriptions`
- `subscription_items` if required
- `entitlement_overrides`
- `usage_counters` or equivalent durable quota records

### API / integrations

- `api_keys`
- `integration_installations`
- `provider_connections`

### Agent telemetry

- `runs`
- `turns`
- `llm_calls`
- `tool_calls`
- `usage_events`
- `budget_decisions`
- `outcomes`
- `findings`

### Governance

- `budgets`
- `policies`
- `policy_bindings` if required by the final schema
- `approvals`
- `audit_events`

Use foreign keys, indexes, unique constraints, and cascading behavior intentionally.

All tenant-owned data must be query-scoped by organization and authorization-checked server-side.

## 7.2 IDs and idempotency

Use globally unique IDs.

Every ingestible telemetry event must support a stable source event ID / idempotency key.

Duplicate ingestion must not double-count tokens or cost.

---

# 8. Authentication, organizations, and RBAC

Implement authentication and organization tenancy.

Preferred production identity provider: WorkOS AuthKit or a compatible abstraction that can grow into enterprise SSO/Directory Sync.

Roles:

- `owner`
- `admin`
- `finance`
- `developer`
- `viewer`

At minimum:

- owner/admin can manage organization, members, integrations, policies, budgets, API keys, and billing;
- finance can view cost/usage/billing and export, but cannot manage provider secrets;
- developer can use Cost Lab, view permitted projects/runs, create permitted API keys, and configure personal integrations where allowed;
- viewer is read-only.

Do not trust client-side role checks as authorization.

Add authorization tests.

---

# 9. Stripe subscriptions and entitlements

Keep the public calculator free.

Implement real subscription plumbing using Stripe Billing.

Plan model:

### Free

- public calculator
- model/pricing pages
- public planning tools
- limited authenticated saved scenarios if desired

### Pro

Target display price: approximately `$15/month`, configured through plan metadata / Stripe Price IDs rather than buried throughout UI code.

Entitlements should include:

- saved Cost Lab history
- prompt comparisons
- personal projects
- personal API key
- personal MCP access
- telemetry/history allowance
- exports

### Team

Target display price: approximately `$29/user/month`, configurable.

Entitlements should include:

- organizations / multiple members
- shared projects
- larger telemetry allowance
- budgets and alerts
- shared API/MCP integrations
- team analytics
- agent-run observability

### Enterprise

Custom / contact sales.

Entitlements:

- SSO
- SCIM / Directory Sync integration path
- RBAC
- service accounts
- audit logs
- SIEM export
- gateway controls
- advanced retention
- dedicated/private deployment architecture
- enterprise support/SLA documentation

## 9.1 Billing flows

Implement:

- Stripe Checkout for Pro/Team
- customer portal
- signed webhook handler
- idempotent webhook processing
- subscription status synchronization
- cancellation / delinquency handling
- server-side plan entitlement checks
- billing settings UI

Required webhook cases should include at minimum the relevant checkout/subscription/invoice state events used by the implementation.

Do not unlock paid features because the browser claims a plan.

## 9.2 No fake billing

If Stripe credentials/price IDs are absent, show an explicit configuration state. Do not simulate a successful purchase in production.

---

# 10. API key system

Implement first-party API keys.

Requirements:

- cryptographically random key material;
- user-visible prefix such as `ti_live_` / `ti_test_`;
- show the full secret only once;
- store only a strong one-way hash plus non-sensitive identifying prefix/last characters;
- scopes/permissions;
- optional project restriction;
- created/last-used/revoked timestamps;
- rotation/revocation;
- audit event for creation/revocation;
- rate/quota checks.

Never persist raw API secrets.

---

# 11. Canonical Agent Run Receipt

Implement the canonical data model described in `AGENT_OBSERVABILITY_CONTROL_REVERSE_ENGINEERING.md`.

At minimum preserve these concepts.

## 11.1 Run

A run should support:

```text
run_id
organization_id
project_id
environment
developer_user_id
service_account_id
agent_name
agent_vendor
agent_version
workflow_name
workflow_version
repo
branch
repo_commit_sha
issue_or_ticket_id
started_at
ended_at
status
termination_reason
estimated_cost_usd
actual_cost_usd
budget_limit_usd
fresh_input_tokens
cache_read_tokens
cache_write_tokens
reasoning_tokens
output_tokens
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

## 11.2 Turn

Support:

```text
turn_id
run_id
turn_index
status                 # completed / aborted / compacted / failed
model_requested
model_resolved
reasoning_effort
fresh_input_tokens
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
usage_source
```

Interrupted/aborted work must remain visible and separately costed when data exists.

## 11.3 LLM calls

Preserve provider-native detail:

- requested/resolved provider/model
- provider request ID
- fresh input
- cache read
- cache write
- audio/image/search usage where relevant
- reasoning
- output
- cost
- cost source
- pricing version
- service tier
- latency
- TTFT
- status
- attempt index
- fallback lineage

Do not collapse all token dimensions into only `input_tokens` and `output_tokens`.

## 11.4 Tool calls

Store metadata such as:

- tool name/category
- parent LLM call
- attempt/retry
- status
- timestamps/duration
- input/output sizes
- estimated carried-context tokens where available
- content hashes only when explicitly useful and privacy-safe

Do not store full shell output or source-code payload by default.

## 11.5 Budget decisions and outcomes

Each run can have policy decisions and an outcome record.

Outcome types should be extensible and support engineering signals such as:

- task completed
- tests passed
- commit created
- PR opened
- CI passed
- PR merged
- deployment successful

---

# 12. Telemetry ingestion API

Create a versioned ingestion surface.

Suggested endpoints:

- `POST /api/v1/events`
- `POST /api/v1/events/batch`
- `POST /api/v1/runs`
- `PATCH /api/v1/runs/:id`
- `GET /api/v1/runs`
- `GET /api/v1/runs/:id`
- `GET /api/v1/usage`

The exact route arrangement can vary if a cleaner API emerges.

Requirements:

- API-key and/or authenticated-user authorization;
- organization/project attribution;
- schema validation;
- request size limits;
- idempotency;
- batch ingestion;
- no-store responses where sensitive;
- clear 4xx errors;
- durable transaction boundaries;
- ingest source classification;
- timestamp normalization;
- no double counting.

Add contract tests.

---

# 13. Coding-agent collectors

Build local-first collectors in this order:

1. Codex
2. Claude Code
3. Cursor
4. Google Antigravity / Gemini tooling where a stable, observable telemetry source exists

Do not invent telemetry unavailable from a tool.

## 13.1 Collector interface

Create a common internal collector model so vendor parsers emit normalized events.

Each collector should support the feasible subset of:

```text
token-intelligence ingest codex
token-intelligence ingest claude
token-intelligence ingest cursor
token-intelligence ingest antigravity

token-intelligence watch codex
token-intelligence watch claude

token-intelligence sync --since 7d
```

Naming may differ if a cleaner CLI grammar is chosen.

Required behaviors:

- `--dry-run` prints the metadata payload that would be uploaded;
- explicit endpoint/API-key configuration;
- local checkpoint/cursor to avoid duplicate uploads;
- historical sync;
- live watch when reliable;
- repo/project attribution;
- developer attribution when available;
- measured vs estimated usage labels;
- graceful handling of corrupt/truncated session files;
- privacy-safe defaults;
- deterministic fixtures/tests.

## 13.2 Codex

Prefer native recorded usage when present.

Capture turn boundaries, models, usage, tool activity, status, and repository metadata where observable.

## 13.3 Claude Code

Capture native usage buckets including cache categories where observable, tool calls, turns, model, status, and timing.

## 13.4 Cursor

If transcript/session formats do not expose real token usage, do not manufacture exact counts.

Optional local estimates may use clearly labeled heuristics and must remain separate from measured aggregate totals.

## 13.5 Antigravity

Implement only against stable observable/public telemetry or documented hooks. If unavailable, create a capability-detection adapter and document the limitation instead of fabricating events.

---

# 14. Agent Run observability UI

Build an authenticated run-observability product, not only aggregate charts.

## 14.1 Overview

Show real organization data for:

- spend this period;
- projected spend;
- tokens by category;
- spend by provider;
- spend by model;
- spend by project;
- spend by agent;
- spend by user/service account;
- savings opportunities;
- budget utilization;
- failed/aborted run cost.

## 14.2 Runs list

Columns/filters should include useful combinations of:

- run ID
- project
- agent
- user/workflow
- environment
- status
- outcome
- models
- tokens
- cost
- duration
- retries
- fallbacks
- findings
- started time

Filters:

- date range
- project
- agent
- provider/model
- user/service account
- environment
- status
- outcome
- cost range
- has finding

## 14.3 Run detail waterfall

Build a readable run receipt with:

```text
Run summary
  ↓
Turn 1
  ├ LLM call(s)
  ├ Tool call(s)
  ├ retry/fallback events
  └ cost/context state
Turn 2
...
Outcome
Findings
Budget decisions
```

Show:

- per-turn cost;
- context growth;
- cache read/write;
- model/fallback transitions;
- tool calls;
- retries;
- failures;
- latency;
- TTFT when available;
- policy decisions;
- final outcome/artifact reference.

---

# 15. Waste analysis engine

Implement a deterministic first version. Do not require an LLM to diagnose basic waste.

Initial rule classes:

1. excessive orientation before first useful action/edit;
2. repeated file reads across turns;
3. oversized tool output carried forward;
4. failed-command/retry loops;
5. same-file edit churn;
6. cache blind spots;
7. excessive context growth;
8. expensive fallback premium;
9. oversized model route for the observed task profile;
10. run with meaningful spend but no verified outcome.

Each finding must contain:

- stable rule ID;
- severity;
- evidence;
- estimated waste tokens where calculable;
- estimated waste USD where calculable;
- confidence / data-quality classification;
- recommended fix;
- explicit verification recipe.

Never present a heuristic estimate as measured waste.

Create unit tests for each rule with positive and negative fixtures.

---

# 16. Cost Lab 2.0

Upgrade the existing Cost Lab into a real scenario workspace.

Features:

- Prompt A vs Prompt B comparison;
- token delta;
- context delta;
- model-by-model cost delta;
- cached-input assumptions;
- output assumptions;
- requests/day/month;
- monthly projection;
- provider/model filters;
- context constraints;
- saved scenarios;
- scenario history;
- CSV/JSON export;
- shareable state that excludes prompt content by default;
- “cheapest permitted model” recommendation based on declared constraints;
- repository/agent-run planning mode when token estimates are available.

The recommendation engine must expose why a model is recommended and must not claim quality guarantees that the system has not measured.

---

# 17. Budgets and policy engine

Budgets/policies must support hierarchical scopes:

- organization
- team
- project
- environment
- user
- service account
- API key
- agent
- workflow
- run

Possible controls:

- USD budget
- token budget
- max turns
- max retries
- max failed tool calls
- max tool calls
- allowed providers
- allowed models
- maximum context utilization
- fallback premium threshold
- RPM/TPM where gateway enforcement exists

Policy actions:

- `ALLOW`
- `WARN`
- `NOTIFY`
- `REQUIRE_APPROVAL`
- `DISABLE_FALLBACK`
- `BLOCK_NEXT_CALL`
- `KILL_RUN`

For overlapping policies, use deterministic, documented composition. Prefer restrictive composition for hard caps/allowlists unless an explicit, authorized override mechanism exists.

Store every evaluated enforcement decision as a budget/policy decision receipt.

## 17.1 Approval flow

Implement approval records for expensive fallback or budget exceptions.

At minimum support:

- pending
- approved
- denied
- expired
- actor
- reason
- timestamps
- policy/run linkage

---

# 18. Alerts and anomaly detection

Implement a practical first version.

Alert types:

- project budget threshold reached;
- unusual daily spend spike;
- run budget approaching hard limit;
- retry/tool-call loop;
- expensive model fallback;
- failed/aborted run with high cost;
- provider/model spend anomaly.

Start with deterministic statistical/threshold rules. Do not require an AI model for alerting.

Support in-app alerts and an outbound webhook destination. Email can be added if an email provider is configured.

---

# 19. MCP server

Build one high-quality authenticated remote MCP server rather than four separate product-specific servers.

Use the current MCP SDK and **Streamable HTTP** transport. Do not implement deprecated transport patterns unless needed explicitly for compatibility.

Expose tools such as:

```text
estimate_cost
compare_models
recommend_model
check_context
check_budget
record_usage
get_usage
get_project_spend
get_run
find_savings
```

Exact schemas must be typed and documented.

Requirements:

- authenticated remote access;
- OAuth-compatible production path where supported by current MCP client expectations;
- API-key fallback only where appropriate/documented;
- tenant/project authorization;
- read/write scopes;
- structured errors;
- rate limits/quotas;
- audit logging;
- contract tests.

Document setup for:

- Codex
- Claude Code
- Cursor
- Google Antigravity

Do not promise automatic passive tracking from MCP where the client does not provide it.

---

# 20. REST API

Expand the developer API beyond `/api/v1/tokenize`.

Target capabilities:

- `/api/v1/models`
- `/api/v1/tokenize`
- `/api/v1/estimate`
- `/api/v1/compare`
- `/api/v1/recommend`
- `/api/v1/usage`
- `/api/v1/runs`
- `/api/v1/budgets`
- event ingestion routes

Requirements:

- typed validation;
- API-key scopes;
- rate/quota controls;
- versioned responses;
- clear precision/source labels;
- OpenAPI specification;
- examples in developer docs;
- privacy behavior documented per endpoint.

---

# 21. TypeScript SDK, Python SDK, and CLI

## TypeScript SDK

Provide a distributable package or clean package-ready implementation for:

- estimates
- model comparisons
- budget checks
- event/run ingestion
- usage/runs retrieval

## Python SDK

Provide parity for the core server APIs.

Keep dependencies minimal.

## CLI

The CLI should support developer workflows such as:

```text
token-intelligence auth/config
token-intelligence estimate
token-intelligence compare
token-intelligence ingest ...
token-intelligence watch ...
token-intelligence usage
token-intelligence runs
token-intelligence budget check
```

Do not require prompt content upload for telemetry commands.

Add package/build/test documentation.

---

# 22. AI Gateway / enforcement layer

Implement the gateway as a modular layer behind explicit gateway routes. Do not silently proxy existing calculator traffic through it.

The gateway is where hard policy enforcement occurs.

## 22.1 Gateway request lifecycle

```text
Authenticate caller
      ↓
Resolve organization/project/key/user/service account
      ↓
Resolve or create run context
      ↓
Evaluate policy and budget
      ↓
Resolve requested provider/model or allowed route
      ↓
Execute provider request
      ↓
Capture provider-native usage
      ↓
Apply bounded retry/fallback policy
      ↓
Persist receipts
      ↓
Reconcile cost
      ↓
Emit OpenTelemetry spans/events
      ↓
Return provider-compatible response
```

## 22.2 Provider support

Prioritize adapters for:

1. OpenAI
2. Anthropic
3. Google Gemini

Design the adapter interface to later support:

- Azure OpenAI
- AWS Bedrock
- Google Vertex AI
- xAI
- DeepSeek
- OpenRouter

Do not fake provider support. Only mark an adapter supported when requests and usage parsing are implemented and tested.

## 22.3 BYOK

Provider API credentials must never be stored plaintext.

Implement application-level authenticated encryption using a server-only master encryption key (for example AES-256-GCM) behind a credential-vault abstraction.

Document a future KMS/HSM migration path.

Never log secrets.

## 22.4 Streaming

Preserve streaming semantics where implemented.

Do not buffer an entire provider response merely for convenience if that materially breaks expected streaming behavior.

Capture final usage when the provider supplies it or reconcile from subsequent metadata where supported.

## 22.5 Rate limiting

For high-frequency gateway rate limits, create a distributed limiter interface. Use Redis only at this point if needed; never use process memory as the sole production limiter on Vercel/serverless.

## 22.6 Fallbacks

Fallbacks must be bounded, recorded, and policy-aware.

Store:

- original requested model;
- resolved model;
- reason;
- fallback lineage;
- incremental premium;
- approval/decision if required.

---

# 23. Cost reconciliation

Separate:

- pre-flight estimated cost;
- model-rate-derived calculated cost;
- provider-reported usage;
- provider-reported actual charge if available;
- reconciled final cost.

Store pricing version/source.

Historical run receipts must not silently change when the current pricing table changes.

Unknown cost must remain unknown or explicitly estimated.

---

# 24. GitHub outcome attribution

Implement GitHub as the first concrete outcome connector.

Goal:

Join agent runs to engineering outcomes where metadata exists.

Support an extensible model for:

- repository
- branch
- commit SHA
- PR number
- CI/check result
- merge status
- deployment status where available

Implement a GitHub App/OAuth/webhook integration path if credentials are available, behind an integration abstraction.

Webhook ingestion must verify signatures and be idempotent.

At minimum, the UI/data model should be capable of answering:

- cost per completed run;
- cost per successful run;
- cost per PR opened;
- cost per CI-passing run;
- cost per merged PR;
- failed/aborted cost;
- before/after optimization at equivalent outcome state.

Do not infer causality when linkage is ambiguous. Show confidence/association quality where needed.

---

# 25. OpenTelemetry

Map the canonical receipts to current OpenTelemetry GenAI semantic conventions wherever compatible.

Add an export abstraction for organizations that want telemetry forwarded to an OTLP-compatible collector.

Do not throw away provider-specific token dimensions merely because the generic OTEL schema does not represent every field.

---

# 26. Enterprise capabilities

Implement the software foundations that can be truthfully shipped now.

## 26.1 SSO / directory sync

Use the chosen enterprise identity provider integration path for:

- SAML/OIDC SSO
- domain/organization association
- Directory Sync / SCIM where supported/configured

If live credentials/features are unavailable, code the production adapters/configuration surfaces and tests but report them as configuration-dependent.

## 26.2 Service accounts

Implement service-account identities and scoped API keys suitable for CI/agents.

## 26.3 Audit logs

Record immutable application audit events for sensitive administrative actions such as:

- API key creation/revocation
- provider credential changes
- role/member changes
- policy/budget changes
- approval decisions
- billing-plan changes
- retention changes
- export configuration

## 26.4 SIEM / export

Implement at least:

- NDJSON/CSV export for authorized audit/usage data;
- generic signed webhook log-stream target.

Keep the architecture ready for Splunk/Datadog/S3/Snowflake-specific destinations later.

## 26.5 Retention

Organization settings should support configurable retention metadata/policies even if deletion jobs are initially simple.

Implement actual deletion behavior for supported retained application data, respecting referential integrity and audit/security requirements.

## 26.6 Deployment models

Document, but do not falsely claim already-delivered:

- dedicated enterprise deployment
- private network/VPC deployment
- self-hosted collector/gateway
- data-residency options

These may remain architecture/runbook items unless the environment genuinely supports deploying them now.

---

# 27. Privacy and security hardening

At minimum:

- no prompt/code storage by default;
- secrets server-side only;
- provider credentials encrypted at rest;
- API keys hashed;
- authorization on every tenant resource;
- CSRF/state protections appropriate to auth/billing flows;
- Stripe webhook signature verification;
- GitHub webhook signature verification;
- request size limits;
- schema validation;
- safe error messages;
- idempotency;
- audit logs;
- rate limits where exposed to abuse;
- security headers/CSP where practical;
- no sensitive request/response logging;
- redact secrets from diagnostics;
- explicit retention behavior;
- dependency audit and documented findings.

Add `SECURITY.md` if absent.

Add a privacy architecture document explaining the difference between:

1. browser-local calculator;
2. metadata collector;
3. explicit REST/MCP calls;
4. gateway traffic;
5. optional content retention if ever enabled.

---

# 28. Pricing/model data quality

Preserve the existing source-verified pricing approach.

Requirements:

- source URL/reference metadata;
- verified-at timestamp/date;
- pricing version;
- long-context tier handling;
- cache pricing where published;
- reasoning/search/provider-specific dimensions where available;
- conservative tokenizer labels;
- historical run prices frozen/reconciled separately from current catalog values.

Do not hardcode stale competitor pricing simply to match a reference site.

---

# 29. Usage analytics and finance views

The finance/product views should be able to group by:

- organization
- team
- project
- environment
- user
- service account
- API key
- agent
- workflow
- provider
- model
- run
- outcome

Useful metrics include:

- spend
- projected spend
- token categories
- cache hit/read share
- average cost/run
- average cost/successful run
- failed/aborted spend
- fallback premium
- retry waste
- tool-call counts
- cost per merged PR when linked
- verified savings from before/after comparisons

Avoid vanity charts that cannot answer an operational question.

---

# 30. Data exports

Implement authorized export for:

- scenarios
- usage summary
- runs
- run receipts
- findings
- audit logs

Support JSON and CSV where appropriate.

Do not export prompt/source content when the organization is in metadata-only mode.

---

# 31. CI / GitHub / deployment hardening

The repository already has a GitHub Actions workflow, but previous runs may have failed before checkout because GitHub assigned no runner. Inspect the current state rather than assuming the issue is fixed.

Required local/CI verification commands should include the appropriate equivalents of:

```bash
npm install
npm run typecheck
npm test
npm run build
```

Add additional scripts as needed for:

- lint
- database schema checks
- migration checks
- SDK/CLI builds
- E2E tests

Use a lockfile and reproducible installs.

If GitHub Actions still receives no runner, document that as an execution/infrastructure blocker rather than calling application tests failed.

Do not weaken tests merely to make CI green.

## Vercel

Continue using the existing Vercel project `token-intelligence` if deployment access is available.

Do not create a duplicate Vercel project.

Connect Git-based preview/production deployment if the available environment permits it.

Production/preview deployment must fail clearly when required production secrets are absent rather than silently disabling security-sensitive functionality.

The public calculator must remain deployable even when optional enterprise integrations are not configured.

---

# 32. Test strategy

Add meaningful coverage, not snapshot theater.

## 32.1 Unit tests

At minimum cover:

- existing cost engine regressions;
- long-context pricing;
- entitlement resolution;
- API-key hashing/verification;
- encryption/decryption vault utility;
- idempotency keys;
- policy composition;
- budget thresholds;
- model allowlists;
- pricing source/version behavior;
- every waste-analysis rule;
- collector parser fixtures;
- measured vs estimated classification;
- cost reconciliation.

## 32.2 Integration tests

Cover:

- authenticated tenant isolation;
- event ingestion + duplicate ingestion;
- run/turn/call creation;
- saved scenarios;
- Stripe webhook processing with signed test fixtures/mocks;
- plan entitlement changes;
- API-key auth/scopes;
- MCP tools;
- provider gateway adapters using mock upstream servers;
- fallback policy;
- budget block behavior;
- GitHub webhook validation/attribution;
- exports;
- retention deletion behavior.

## 32.3 E2E

Add Playwright or equivalent browser E2E coverage for core journeys:

1. anonymous user uses calculator;
2. authenticated user creates/saves a Cost Lab scenario;
3. user views usage dashboard;
4. user opens a run receipt;
5. authorized admin creates/revokes API key;
6. admin creates budget/policy;
7. pricing/billing page renders correct plan state;
8. configuration-dependent integrations show honest unconfigured states.

Use controlled local fixtures, not fabricated production telemetry.

## 32.4 Collector fixtures

Maintain sanitized fixtures for each supported agent transcript/event format.

The fixture matrix must document:

- agent/tool version represented;
- measured fields available;
- estimated fields;
- missing fields;
- corrupt/truncated case;
- aborted/interrupted case where available;
- fallback/multi-model case where available.

---

# 33. Performance and reliability

Design ingestion for batch efficiency.

Avoid N+1 writes/queries for event batches.

Use transactions where needed for run aggregates and idempotency.

Do not recompute entire organization history on every dashboard request.

Introduce summary/materialized rollups only after profiling shows they are justified.

Gateway retries must be bounded.

Collector sync must be restart-safe.

Streaming paths must handle disconnects and aborted requests without losing the final run state when recovery is possible.

---

# 34. Documentation deliverables

Update or create:

- `README.md`
- `IMPLEMENTATION_PLAN.md`
- `DEPLOYMENT.md`
- `SECURITY.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/PRIVACY_ARCHITECTURE.md`
- `docs/BILLING_AND_ENTITLEMENTS.md`
- `docs/AGENT_RUN_RECEIPTS.md`
- `docs/COLLECTORS.md`
- `docs/MCP.md`
- `docs/API.md`
- `docs/GATEWAY.md`
- `docs/ENTERPRISE.md`
- `docs/OPERATIONS.md`
- `.env.example`

Document every required environment variable without putting secrets in the repository.

Provide setup instructions for local development and production deployment.

---

# 35. Environment variables

Exact names can be refined during implementation, but the final `.env.example` should cover concepts like:

```text
DATABASE_URL
APP_BASE_URL

WORKOS_API_KEY
WORKOS_CLIENT_ID
WORKOS_COOKIE_PASSWORD
WORKOS_WEBHOOK_SECRET

STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_PRO
STRIPE_PRICE_TEAM

TOKEN_INTELLIGENCE_ENCRYPTION_KEY

REDIS_URL                  # only if gateway distributed limiting is enabled

OPENAI_API_KEY             # optional system/provider test connection
ANTHROPIC_API_KEY
GOOGLE_GENERATIVE_AI_API_KEY

GITHUB_APP_ID
GITHUB_PRIVATE_KEY
GITHUB_WEBHOOK_SECRET

OTEL_EXPORTER_OTLP_ENDPOINT
OTEL_EXPORTER_OTLP_HEADERS
```

Do not require system-wide provider API keys for customers using BYOK.

---

# 36. Acceptance criteria by production gate

## Gate A — Commercial product foundation

Must have:

- substantially redesigned public UI;
- authenticated app shell;
- PostgreSQL/migrations;
- users/orgs/projects;
- saved Cost Lab scenarios;
- Stripe subscription plumbing;
- server-side entitlements;
- API keys;
- all existing calculator/parity functionality preserved;
- tests/build green locally.

## Gate B — Agent telemetry foundation

Must have:

- canonical run/turn/LLM/tool schemas;
- idempotent event ingestion;
- Codex collector;
- Claude Code collector;
- Cursor adapter with honest precision labels;
- Antigravity capability adapter if stable data exists;
- run list/detail UI;
- findings engine;
- export.

## Gate C — Developer integration

Must have:

- authenticated MCP server;
- documented Codex/Claude/Cursor/Antigravity setup;
- expanded REST API;
- TypeScript SDK;
- Python SDK core;
- CLI;
- scopes/quotas/audit events;
- contract tests.

## Gate D — Control plane

Must have:

- budgets/policies;
- decisions/approvals;
- alerts;
- gateway adapters for supported providers;
- BYOK encrypted storage;
- hard policy enforcement at gateway;
- retries/fallback receipts;
- actual-vs-estimated reconciliation;
- OpenTelemetry export path.

## Gate E — Enterprise/outcomes

Must have:

- RBAC;
- SSO/Directory Sync production integration path;
- service accounts;
- audit logs;
- SIEM/webhook export;
- retention controls;
- GitHub outcome attribution;
- cost-per-outcome metrics;
- enterprise/security docs.

If a gate contains a credential-dependent capability that cannot be exercised live, the implementation must still include production wiring and tests, and the completion report must mark it **code-complete / configuration-blocked**, not “live.”

---

# 37. Explicit anti-goals

Do not:

- rebuild the product as a clone of Faros, Ramp, Langfuse, Helicone, LiteLLM, CostHawk, TurnLens, cram-ai, or token-calculator.net;
- copy competitors’ copy/assets/layouts;
- remove the free calculator;
- collect prompt/code content by default;
- claim Cursor/Antigravity exact usage if only estimates are available;
- claim MCP passively observes calls it does not receive;
- use client-side-only billing entitlement checks;
- store raw API keys/provider secrets;
- use in-memory-only production rate limits in serverless;
- silently swallow provider/gateway failures;
- retry forever;
- call unknown pricing free;
- call token reduction a success when outcome quality falls;
- add microservices, queues, Redis, Docker, or Kubernetes without a demonstrated requirement;
- create fake demo telemetry in production;
- hide configuration blockers;
- stop after writing plans/docs when implementation is possible.

---

# 38. Required implementation behavior

Work directly in code.

For each production gate:

1. inspect existing implementation;
2. write/modify code;
3. write migrations/tests;
4. run tests/typecheck/build;
5. fix failures rather than documenting them away;
6. commit focused changes;
7. continue to the next gate when the repository remains healthy.

If a task is too large to complete in one change, implement the smallest **real vertical slice** that leaves a production-capable path, not an empty placeholder.

Do not ask for confirmation between ordinary implementation steps.

Do not start a separate repository.

---

# 39. Final verification

Before declaring completion, run all applicable verification commands and report exact results.

At minimum verify:

- dependency install;
- formatting/lint if configured;
- TypeScript;
- unit tests;
- integration tests;
- collector fixture tests;
- E2E tests;
- database migration validation;
- production build;
- API/MCP contract tests;
- gateway mock-provider tests;
- privacy/security checks;
- no raw secrets committed;
- no prompt/code persistence in default telemetry path;
- no tenant-crossing queries in tests;
- Vercel preview/production state if deployable;
- GitHub Actions state if available.

Do not say tests passed unless they actually ran.

---

# 40. Pull request

At completion:

- push `production-wave-2-agent-economics`;
- open/update a PR targeting `observability-control-research` unless the repository owner has already merged/rebased the research branch and a newer correct base is clearly required;
- do not merge the PR automatically.

The PR body should summarize:

- architecture changes;
- UI redesign;
- SaaS/auth/organizations;
- billing/subscriptions;
- database/migrations;
- run receipt schema;
- collectors;
- observability UI;
- waste analysis;
- budgets/policies;
- MCP/API/SDK/CLI;
- gateway/provider adapters;
- enterprise capabilities;
- outcome attribution;
- security/privacy;
- tests/build/deployment;
- configuration blockers;
- remaining work.

---

# 41. Required final completion report

Return a concrete completion report containing:

1. **Final branch name**
2. **Final commit SHA**
3. **PR number/link**
4. **Implementation summary**
5. **Files/major modules added or changed**
6. **Database schema + migrations added**
7. **Public routes**
8. **Authenticated app routes**
9. **REST API endpoints**
10. **MCP tools**
11. **Collector support matrix**
12. **Provider gateway support matrix**
13. **Subscription/entitlement matrix**
14. **Budget/policy capabilities**
15. **Enterprise capabilities**
16. **Outcome-attribution capabilities**
17. **Tests added**
18. **Exact test results**
19. **Typecheck result**
20. **Build result**
21. **CI result**
22. **Deployment/preview status**
23. **Privacy verification**
24. **Security verification**
25. **External integrations that are live**
26. **External integrations that are code-complete but configuration-blocked**
27. **Known limitations**
28. **Recommended next production wave**

Be precise. Distinguish clearly between:

- implemented;
- tested;
- deployed;
- configured/live;
- blocked by external credentials/platform permissions.

---

# 42. Product success definition

This project is successful when a user can move through the following real workflow:

```text
Anonymous developer
   ↓
uses free calculator
   ↓
signs in
   ↓
creates project
   ↓
saves Cost Lab scenario
   ↓
connects CLI/MCP/collector
   ↓
agent run receives run ID
   ↓
turns + LLM calls + tools become receipts
   ↓
actual/estimated cost is reconciled
   ↓
run appears in observability UI
   ↓
waste finding identifies actionable cause
   ↓
project/run budget is configured
   ↓
MCP can advise before a run
   ↓
gateway can enforce hard policy where traffic is routed through it
   ↓
GitHub outcome links the run to a commit/PR/test/merge
   ↓
organization can measure cost per successful outcome
```

The final commercial question Token Intelligence should answer is:

> **What did this AI run cost, what did it produce, where did it waste money, and why did policy allow it?**

Build toward that question end to end.