# Token Intelligence — Product Logic & Feature Plan

Reference product: https://token-calculator.net/  
Repository: https://github.com/rrahul0904/token-calculator  
Baseline review: 2026-09-04

## 1. Product direction

Token Intelligence should preserve the strongest parts of Token-Calculator.net as a clean-room implementation while expanding the product into a broader LLM cost-intelligence and AI FinOps platform.

The product ladder is:

```text
FREE ACQUISITION
token calculator
model pricing explorer
cost calculator
tokens ↔ words
GPU / VRAM planner
token speed simulator
provider guides
        ↓
DEVELOPER
token API
pricing / model metadata API
API keys
SDKs / CLI
MCP
        ↓
TEAM
projects
saved scenarios
usage dashboards
budgets
alerts
shared model policies
        ↓
BUSINESS
provider integrations
actual-vs-estimated spend
cost allocation
optimization recommendations
routing / gateway controls
        ↓
ENTERPRISE
RBAC
SSO / SCIM
audit logs
policy enforcement
private / dedicated deployment
```

The free calculator is not a throwaway demo. It is the primary acquisition surface and must remain fast, useful, privacy-first, indexable, and usable without an account.

## 2. Clean-room boundary

This project reverse-engineers observable product behavior, user journeys, public API contracts, and public documentation.

Do not copy:

- proprietary source code
- private APIs
- copyrighted visual assets
- branding or logos
- page copy verbatim
- hidden implementation details obtained through circumvention

Do independently implement:

- equivalent public utility workflows
- equivalent or better UX outcomes
- independently designed components
- independently modeled pricing logic
- independently written educational content
- public API behavior where useful
- materially better product capabilities

## 3. Current reference-product baseline

As of the 2026-09-04 public review, Token-Calculator.net exposes:

### Free browser utility
- browser-local token counting
- token-piece visualization
- token, word, no-space-character, and all-character counts
- prompt/document/code/JSON/chat use cases
- OpenAI, Anthropic, and Google model pricing comparison
- input, cached-input, and output pricing
- context-window information
- automatic long-context price tiers where applicable
- dark/light theme

### Free planning tools and SEO surfaces
- token cost calculator
- tokens-to-words converter
- LLM RAM / GPU memory calculator
- token-speed simulator
- tokenization guide
- provider-specific OpenAI / Claude / Gemini guides
- educational token content and FAQ pages

### Developer API
- `POST /api/v1/tokenize`
- bearer API keys
- token / character / no-space-character / word-count response
- submitted text processed for the response and not stored
- dashboard-based key management
- active-subscription requirement

### Reference commercial packaging
- browser calculator: free
- API monthly: $1.99/month
- API yearly: $9.99/year
- billing: Creem in the reference product

These facts are a point-in-time baseline only. Production pricing and provider model metadata must always be verified against current official sources.

## 4. Primary users

### Developer
Needs to answer:
- How many tokens is this payload?
- Will it fit?
- What will it cost?
- Which model is cheaper?
- Can I call this calculation from code?

### AI engineer / prompt engineer
Needs to:
- inspect token boundaries
- compare prompt variants
- identify context waste
- understand cache opportunities
- estimate output cost
- compare models and providers

### Product manager / founder
Needs to:
- forecast AI unit economics
- model requests/day and monthly spend
- understand cost drivers
- choose model tiers
- compare architecture options

### Engineering manager / FinOps
Needs to:
- observe actual usage
- allocate spend by project/team
- set budgets
- detect anomalies
- enforce policy
- validate savings

## 5. Core product loops

### 5.1 Anonymous calculator loop

```text
paste text
   ↓
local tokenize
   ↓
show tokens + words + characters + token pieces
   ↓
apply model pricing
   ↓
compare models
   ↓
check context utilization
   ↓
adjust prompt / model / workload assumptions
```

No account is required.

### 5.2 Cost-planning loop

```text
input token count
+ cached token count
+ expected output
+ requests/day or requests/month
        ↓
pricing rules
        ↓
per-request cost
        ↓
monthly cost
        ↓
model ranking
        ↓
savings delta
```

### 5.3 Developer conversion loop

```text
free calculator
    ↓
developer needs automation
    ↓
API docs
    ↓
sign up
    ↓
subscription / entitlement
    ↓
create API key
    ↓
call tokenize / pricing APIs
    ↓
usage dashboard
```

### 5.4 FinOps loop

```text
ESTIMATE
   ↓
OBSERVE
   ↓
RECONCILE
   ↓
ATTRIBUTE
   ↓
OPTIMIZE
   ↓
CONTROL
   ↓
VERIFY
```

## 6. Canonical product logic

### 6.1 Tokenization

Create a tokenizer registry rather than hard-coding one tokenizer into page components.

Canonical interface:

```ts
type TokenizerPrecision =
  | "exact"
  | "provider_reference"
  | "compatible_family"
  | "estimated";

interface TokenizerAdapter {
  id: string;
  family: string;
  supports(modelId: string): boolean;
  tokenize(text: string): Promise<{
    ids?: number[];
    pieces: string[];
    count: number;
    precision: TokenizerPrecision;
  }>;
}
```

Rules:

1. Browser calculation should remain local whenever technically practical.
2. Large payloads must run off the main UI thread.
3. Never present an approximate count as exact.
4. The UI must show the tokenizer family / precision when relevant.
5. Prompt text must not be persisted by default.
6. If a provider offers an authoritative token-count endpoint, it may be added as an explicit opt-in server/provider mode rather than silently uploading text.

### 6.2 Text metrics

For the same input calculate:

- token count
- word count
- total characters
- characters excluding whitespace
- optional lines
- optional bytes
- optional estimated words-per-token

Token count is tokenizer-specific. Character and word counts are deterministic local metrics.

### 6.3 Token-piece visualization

Token visualization should:

- render pieces progressively or efficiently for large payloads
- visibly distinguish whitespace and line breaks
- allow token index / ID inspection where available
- avoid rendering tens of thousands of DOM nodes without virtualization/capping
- allow copy/export of a safe result summary without automatically copying private prompt text

### 6.4 Pricing engine

Pricing must be data-driven and versioned.

Canonical model:

```ts
interface PriceRule {
  inputPerMillion?: number;
  cachedInputPerMillion?: number;
  outputPerMillion?: number;
  cacheWritePerMillion?: number;
  minimumInputTokens?: number;
  maximumInputTokens?: number;
  serviceTier?: string;
  region?: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

interface ModelProfile {
  id: string;
  provider: string;
  displayName: string;
  tokenizerFamily?: string;
  inputContextWindow?: number;
  maxOutputTokens?: number;
  pricingSourceUrl: string;
  priceRules: PriceRule[];
}
```

Cost:

```text
input_cost =
  billable_input_tokens / 1,000,000
  × applicable_input_rate

cached_input_cost =
  cached_input_tokens / 1,000,000
  × applicable_cached_rate

output_cost =
  output_tokens / 1,000,000
  × applicable_output_rate

request_cost =
  input_cost
  + cached_input_cost
  + output_cost
  + any explicitly modeled extras

monthly_cost =
  request_cost
  × monthly_requests
```

Rules:

- long-context tiers are selected from rules, not page-specific conditionals
- a missing price is `unknown/not offered`, never zero
- provider-specific fees not modeled must be disclosed
- pricing records need source URL and verification timestamp
- historical rate versions should remain addressable when usage is reconciled later

### 6.5 Context logic

```text
effective_input =
  system + developer + user + conversation + RAG + tool schemas + other context

headroom =
  context_window - effective_input - reserved_output

utilization =
  effective_input / context_window
```

Show:

- utilization %
- remaining headroom
- reserved output
- warning thresholds
- overflow state

Do not imply that every provider counts message/tool overhead identically.

### 6.6 Model comparison

Allow comparison by:

- provider
- model
- input price
- cache-read price
- output price
- context window
- expected request cost
- expected monthly cost

Useful ranking modes:

- lowest estimated cost
- lowest input rate
- lowest output rate
- largest context
- provider filter
- exact/compatible tokenizer availability

Future ranking can include quality/latency only when supported by evidence.

### 6.7 Workload forecasting

Inputs:

- requests/day or month
- average input tokens
- cached share / cached tokens
- expected output tokens
- workload growth %
- optional project/team

Outputs:

- per-request cost
- daily cost
- monthly cost
- annualized cost
- comparison against selected models
- delta versus baseline
- projected savings

### 6.8 GPU / VRAM planning

Minimum weight-memory model:

```text
raw_weight_memory =
  parameter_count × bytes_per_parameter

estimated_total =
  raw_weight_memory × runtime_overhead_factor
```

Support common precisions:

- FP32
- FP16/BF16
- FP8/INT8
- INT4 / 4-bit

Clearly label this as planning math. KV cache, activations, parallelism, quantization metadata, framework overhead, sequence length, and batching can materially change real memory needs.

### 6.9 Token-speed simulator

Inputs:

- time to first token
- decode tokens/second
- output token count

```text
decode_time = output_tokens / tokens_per_second
total_time = ttft + decode_time
```

The UI should visually simulate streaming while keeping TTFT separate from decode speed.

### 6.10 Public developer API

Compatibility surface:

```http
POST /api/v1/tokenize
Authorization: Bearer <key>
Content-Type: application/json
```

Minimum request:

```json
{ "text": "hello world" }
```

Minimum response:

```json
{
  "tokens": 2,
  "characters": 11,
  "charactersWithoutSpaces": 10,
  "words": 2
}
```

Our improved contract should optionally support:

```json
{
  "text": "hello world",
  "model": "optional-model-id",
  "includePieces": false
}
```

and return metadata such as:

```json
{
  "tokens": 2,
  "characters": 11,
  "charactersWithoutSpaces": 10,
  "words": 2,
  "tokenizer": {
    "family": "o200k_base",
    "precision": "provider_reference"
  }
}
```

The API must:

- enforce payload limits
- use no-store response caching
- not log prompt content
- rate-limit by key/plan
- return stable structured errors
- meter count/cost metadata without retaining submitted text

### 6.11 API keys

Recommended security design:

- generate a high-entropy secret once
- show the full secret only at creation
- store prefix + last4 + cryptographic hash
- never store a reversible copy unless there is a compelling documented requirement
- support named keys
- support revoke/rotate
- record last-used timestamp
- scope keys as the API grows
- never expose keys to browser client bundles

### 6.12 Authentication and organizations

Anonymous users can use free tools.

Authenticated users gain:

- account
- organization
- projects
- saved scenarios
- API keys
- usage
- billing
- budgets / alerts
- developer integrations

Future enterprise:

- RBAC
- service accounts
- SSO
- SCIM
- audit logs

### 6.13 Billing and entitlements

Billing provider is an implementation choice; current repository scaffolding uses Stripe.

Entitlements, not UI checks, determine access.

Example:

```text
FREE
public tools

PRO
API + saved scenarios + higher quotas

TEAM
organizations + shared projects + budgets + team usage

ENTERPRISE
SSO/SCIM + audit + controls + dedicated support/deployment
```

Do not fake checkout success when billing is not configured.

### 6.14 SEO / discovery engine

The reference product demonstrates that distribution is a first-class product capability.

Build a structured content graph around:

- provider pricing
- individual model pricing
- token cost
- context windows
- tokens-to-words
- model comparisons
- prompt cost
- GPU memory
- throughput / latency
- tokenization concepts
- API use cases

Each useful programmatic page should have:

- unique title/description
- canonical URL
- structured data when appropriate
- current pricing provenance
- internal links
- useful calculator CTA
- useful API CTA
- sitemap inclusion

Never generate thin doorway pages.

## 7. Page / route plan

### Public core
- `/` — token calculator + model cost comparison
- `/models` — searchable model/pricing catalog
- `/tools` — tool directory
- `/tools/cost`
- `/tools/tokens-words`
- `/tools/memory`
- `/tools/speed`
- `/developers`
- `/pricing`

### Discovery / guides
- `/guides/tokens`
- `/guides/tokenization`
- `/guides/openai`
- `/guides/anthropic`
- `/guides/gemini`
- future provider/model pages generated from verified catalog data

### Authenticated
- `/app`
- `/app/projects`
- `/app/scenarios`
- `/app/api-keys`
- `/app/usage`
- `/app/budgets`
- `/app/integrations`
- `/app/settings`
- `/app/billing`

## 8. Domain model

Minimum SaaS entities:

```text
User
Organization
Membership
Project
SavedScenario
Provider
Model
PricingVersion
PricingRule
ApiKey
ApiUsage
Subscription
Entitlement
Budget
AlertRule
Integration
UsageEvent
AuditEvent
```

Future FinOps entities:

```text
AgentRun
AgentTurn
ModelCall
ToolCall
CostReceipt
Policy
PolicyDecision
ProviderCredential
ReconciliationRecord
OptimizationRecommendation
OutcomeSignal
```

## 9. Usage/event model

Do not store raw prompt text by default.

Useful usage event:

```text
event_id
organization_id
project_id
api_key_id / actor_id
provider
model
tokenizer_precision
input_tokens
cached_input_tokens
output_tokens
estimated_cost
measured_cost
pricing_version
latency_ms
source
occurred_at
```

Source classification should distinguish:

- provider measured
- agent measured
- local tokenizer reference
- estimated
- reconciled

Unknown values stay unknown.

## 10. Architecture target

Current repository direction is appropriate:

```text
Next.js / React / TypeScript
        │
        ├── public calculator
        │      └── browser worker tokenizer
        │
        ├── server routes / APIs
        │
        ├── auth / organizations
        │
        └── dashboard
               │
          PostgreSQL + Drizzle
               │
      ┌────────┼─────────┐
      │        │         │
  billing   API keys   usage
```

Keep public calculation local-first. Durable account, entitlement, API-key, and usage data belongs server-side.

As scale grows, high-volume telemetry can move to an analytics store without making the initial product unnecessarily complex.

## 11. Current repository state versus roadmap

Based on the current repository documentation, the following already exist or are substantially implemented:

- browser-local tokenization
- token-piece visualization
- text metrics
- schema-driven model pricing
- multi-provider catalog
- context planning
- monthly forecasting
- Cost Lab
- token/word planner
- GPU memory planner
- token speed simulator
- public tokenize endpoint
- developer documentation
- pricing/product packaging
- test/build tooling

Do not rebuild these blindly. Audit them against this plan, keep what works, fix gaps, and add regression tests.

The next layers are:

1. production-grade auth / organizations / durable SaaS data
2. billing entitlements
3. production API-key lifecycle and usage metering
4. saved scenarios and project workflows
5. SDK / CLI / MCP integrations
6. provider usage reconciliation
7. budgets, alerts, optimization, and gateway policy
8. enterprise controls

## 12. Delivery waves

### Wave A — Reference parity audit
- re-audit current public reference routes and behavior
- update parity matrix
- verify all existing free-tool workflows
- close UX / correctness gaps
- verify mobile and accessibility

### Wave B — Product-quality free surface
- strengthen tokenizer precision UX
- strengthen pricing provenance
- improve comparison UX
- improve calculator sharing/export without leaking prompt text
- build high-quality provider/model guide templates
- harden SEO and structured metadata

### Wave C — Developer SaaS
- auth
- organizations
- Postgres production schema
- subscriptions / entitlements
- API keys
- quotas / usage
- dashboard
- stable versioned API

### Wave D — Developer ecosystem
- TypeScript SDK
- Python SDK
- CLI
- MCP
- GitHub Action / CI checks
- Codex / Claude Code / Cursor integration paths

### Wave E — AI FinOps
- provider integrations
- usage ingestion
- actual-vs-estimated reconciliation
- project/team attribution
- budgets / alerts
- cost anomaly detection
- optimization recommendations

### Wave F — Control plane
- gateway
- routing
- model allowlists
- policy engine
- rate limits
- fallbacks
- spend controls

### Wave G — Enterprise
- RBAC
- SSO / SCIM
- service accounts
- audit logs
- retention controls
- SIEM export
- private/dedicated deployment options

## 13. Quality gates

Every production wave must pass:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Run integration/E2E suites for changed workflows.

Critical regression tests:

- local calculator does not upload text
- token counts are deterministic for a given adapter/version
- approximation labels cannot silently become `exact`
- pricing tier boundary tests
- unavailable cached-input pricing does not become zero
- context overflow boundary tests
- API request-size tests
- API authentication / entitlement tests
- API-key revocation tests
- webhook idempotency tests
- quota/rate-limit tests
- no secret appears in client bundles/logs
- no prompt body is persisted in default telemetry

## 14. Product success metrics

Free acquisition:
- organic sessions
- calculator completion
- returning users
- provider/model page traffic
- tool-to-developer-doc conversion

Developer:
- sign-ups
- API keys created
- successful API calls
- retained active developers
- free-to-paid conversion

Team / FinOps:
- connected projects/providers
- tracked monthly AI spend
- budgets created
- anomalies surfaced
- recommendations accepted
- verified savings

## 15. Non-goals

Do not:

- become a generic chat application
- hide uncertainty in tokenization or pricing
- store prompts by default
- pretend estimated spend is provider-measured spend
- add fake enterprise controls
- add fake integrations
- replace working free utilities with a dashboard-only experience
- optimize solely for token reduction while ignoring outcome quality

## 16. North-star positioning

Token Intelligence should evolve from:

> How many tokens will this use?

to:

> **What will this AI workload cost, what did it actually cost, why, and what should we change or enforce next?**

The free calculator remains the wedge. The durable business is developer infrastructure plus AI cost intelligence, observability, optimization, and control.
