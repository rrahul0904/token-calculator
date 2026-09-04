# Codex Vibe Reverse-Engineering Prompt — Token-Calculator.net → Token Intelligence

Repository: `rrahul0904/token-calculator`  
Reference product: https://token-calculator.net/  
Product plan: `docs/PRODUCT_LOGIC_AND_FEATURE_PLAN.md`

You are Codex operating as a senior product engineer, reverse engineer, UX engineer, SaaS architect, test engineer, and technical product owner.

Your job is to **vibe reverse-engineer Token-Calculator.net end to end using only publicly observable behavior and public documentation, then evolve the existing Token Intelligence repository into an independently implemented product that reaches or exceeds the useful capabilities of the reference.**

This is a **clean-room implementation**.

Do not copy proprietary source code, private APIs, visual assets, logos, branding, copyrighted copy, or undisclosed implementation details.

Do not attempt to bypass authentication, scrape private data, defeat rate limits, inspect secrets, or exploit the reference site.

You may inspect:

- public pages
- public HTML/DOM behavior
- public API documentation
- public pricing pages
- public Terms / Privacy / About pages
- browser-visible network behavior needed to understand normal public workflows
- public structured metadata
- official provider pricing documentation
- public screenshots created from ordinary browsing

The goal is functional understanding and independent implementation, not source-code cloning.

---

# 0. Important context: this is NOT greenfield

The repository already contains significant production work.

Before changing anything, inspect the current repository and preserve working functionality.

At minimum read:

- `README.md`
- `REVERSE_ENGINEERING.md`
- `COMPETITIVE_PARITY.md`
- `IMPLEMENTATION_PLAN.md`
- `AGENT_OBSERVABILITY_CONTROL_REVERSE_ENGINEERING.md`
- `docs/PRODUCT_LOGIC_AND_FEATURE_PLAN.md`
- `docs/CODEX_AGENT_ECONOMICS_PLATFORM_IMPLEMENTATION_PROMPT.md`
- `DEPLOYMENT.md`
- `SECURITY.md`
- `docs/PRIVACY.md`
- `package.json`
- `next.config.ts`
- `proxy.ts`
- `drizzle.config.ts`
- all DB schema/migrations
- all code under `src/app`
- all code under `src/components`
- all code under `src/lib`
- tokenizer workers
- all tests
- CI workflows

Also inspect:

```bash
git status
git log --oneline --decorate -20
git branch -a
```

If GitHub access is available, inspect open PRs/issues before choosing a base branch.

Do **not**:

- initialize another app
- replace the repository
- delete working functionality
- downgrade current provider/model coverage
- remove tests to make builds pass
- fake incomplete SaaS functionality
- overwrite newer work with an older prompt assumption

Treat existing code as the source of truth for what is already implemented.

---

# 1. Mission

Reconstruct the reference product's public product logic and user experience, then build an improved Token Intelligence product with this progression:

```text
FREE UTILITY
    ↓
MODEL / COST INTELLIGENCE
    ↓
DEVELOPER API
    ↓
DEVELOPER SAAS
    ↓
TEAM COST MANAGEMENT
    ↓
AI FINOPS / CONTROLS
```

The immediate reverse-engineering target is the reference product's public experience:

```text
token counting
token visualization
word / character metrics
model pricing
cost calculation
context planning
provider/model guides
tokens ↔ words
GPU memory planning
speed simulation
API docs
API-key workflow
paid API packaging
privacy posture
SEO/discovery structure
```

Then improve it without breaking the simple free wedge.

---

# 2. Point-in-time reference baseline

The following was publicly observable on 2026-09-04 and is a starting hypothesis, not an excuse to skip live verification.

## Main calculator

Public reference behavior includes:

- free browser token calculator
- local browser processing language
- token-piece visualization
- token count
- word count
- characters excluding spaces
- total characters
- OpenAI pricing comparison
- Anthropic pricing comparison
- Google/Gemini pricing comparison
- input pricing
- cache-read pricing
- output pricing
- context-window display
- automatic long-context pricing where modeled
- dark/light theme
- prompt/document/code/JSON/chat positioning

At the review point, the reference advertised model groups approximately as:

- OpenAI: 9 models
- Anthropic: 7 models
- Google: 8 models

Do not hard-code these counts as permanent truths.

## Public tools/content

Reference public surfaces include or advertise:

- token cost calculator
- tokens-to-words
- LLM RAM / GPU memory calculator
- token speed simulator
- tokenization guide
- OpenAI models/cost guide
- Claude models/cost guide
- Gemini models/cost guide
- token educational pages / FAQ

## Developer API

Public reference API:

```http
POST /api/v1/tokenize
Authorization: Bearer tc_live_...
Content-Type: application/json
```

Example request:

```json
{
  "text": "hello world"
}
```

Example response shape:

```json
{
  "tokens": 2,
  "characters": 11,
  "charactersWithoutSpaces": 10,
  "words": 2
}
```

Publicly documented errors include:

- `401 invalid_api_key`
- `402 subscription_required`
- `413 text_too_large`

The reference documentation states that the API does not require a model-specific encoding input.

## Reference pricing

At the review point:

- browser calculator: free
- API monthly: $1.99/month
- API yearly: $9.99/year

The reference uses Creem for billing.

Our repository currently has Stripe scaffolding. Do **not** swap payment providers merely to imitate the reference. Use the architecture already chosen unless the owner explicitly decides otherwise.

---

# 3. Product principles

These are non-negotiable.

## 3.1 Preserve the anonymous free wedge

The core calculator, model catalog, and useful planning tools must work without sign-in.

## 3.2 Local-first privacy

For the public browser calculator:

```text
PROMPT TEXT
   ↓
BROWSER
   ↓
TOKENIZER WORKER
   ↓
RESULT
```

Prompt text should not be sent to the server by default.

If any feature uploads text, make that boundary explicit before the upload occurs.

## 3.3 Honest precision

Tokenization precision must be labeled.

Allowed classifications should include something like:

- exact
- provider reference
- compatible family
- estimated

Never turn an approximation into a false exact claim.

## 3.4 Pricing is versioned data, not scattered UI math

All cost surfaces must use one shared pricing engine and model catalog.

## 3.5 Unknown is not zero

Unavailable cache pricing or unknown cost must render as unavailable/unknown, not `$0`.

## 3.6 No fake SaaS

If auth, billing, API key persistence, provider integration, or enterprise configuration is not actually connected:

- implement the correct integration boundary
- render a clear not-configured state
- document env vars
- test with deterministic mocks
- never fabricate success

## 3.7 Mobile, accessibility, and speed are product requirements

The calculator must feel instant and usable on a phone as well as desktop.

---

# 4. Work mode

Execute autonomously.

Do not stop after writing a research document.

Do not merely produce wireframes.

Do not ask the user to make routine implementation decisions already implied by this prompt.

When ambiguity exists:

1. inspect the repository
2. inspect the reference product
3. choose the simplest architecture consistent with the existing codebase
4. document the decision
5. implement it
6. test it

Only block when an external credential, destructive action, payment/account approval, or repository permission truly requires the owner.

---

# 5. Phase 0 — Establish a safe implementation branch

Start from the latest appropriate production branch after inspecting repository history.

Suggested branch:

`vibe-reverse-engineering-token-calculator`

If it already exists, inspect and continue it.

Do not force-push.

Keep commits focused and repository buildable.

---

# 6. Phase 1 — Live public-product audit

Perform a fresh public audit of https://token-calculator.net/.

Use ordinary browser navigation / Playwright / curl as appropriate.

Do not crawl aggressively.

Create/update a dossier containing:

## 6.1 Route inventory

Capture public routes you can reach from:

- global navigation
- home page
- footer
- sitemap
- robots
- public docs

For each route record:

```text
route
purpose
primary user
primary CTA
input controls
output panels
navigation links
mobile behavior
auth requirement
SEO intent
observed errors/empty states
```

## 6.2 Main calculator behavior

Test at minimum:

- empty input
- plain English
- whitespace-heavy text
- emojis
- Unicode
- JSON
- code
- multiline text
- very long text
- copy/paste behavior
- clear/reset behavior if exposed
- token-piece visualization
- theme toggle
- responsive layout

Do not submit secrets or personal content.

## 6.3 Cost behavior

Observe:

- how input token count maps into displayed model costs
- whether output-token assumptions exist
- cached-input behavior
- long-context price changes
- context-window labels
- rounding precision
- unavailable prices
- sorting/grouping

## 6.4 Planning tools

Audit each public tool independently.

Record its:

- inputs
- defaults
- formulas inferred from public behavior
- explanatory content
- warnings/disclaimers
- outputs
- responsive behavior
- CTA path

## 6.5 API funnel

Audit public API docs/pricing flow:

```text
calculator
  ↓
API CTA
  ↓
API docs / pricing
  ↓
sign-in
  ↓
checkout
  ↓
key dashboard
```

Do not purchase anything.

Do not attempt to access authenticated data without an owner-provided account.

Document only public/auth-wall behavior.

## 6.6 Privacy/business clues

Read public:

- privacy
- terms
- about/contact
- API docs
- pricing

Use these only to understand declared product behavior, data handling, vendors, and commercial model.

## 6.7 SEO structure

Review:

- titles
- descriptions
- headings
- canonical links
- sitemap
- robots
- JSON-LD / structured data when visible
- internal linking
- provider/model guide architecture
- tool-to-API conversion links

Do not copy prose.

---

# 7. Phase 2 — Build a parity + differentiation matrix

Update or supersede `COMPETITIVE_PARITY.md`.

Each row needs:

```text
capability
reference observed?
current repo?
parity status
quality gap
implementation location
test coverage
decision
```

Decision must be one of:

- preserve current
- fix
- add
- intentionally differ
- defer
- reject

Include these major categories:

1. main calculator
2. tokenizer behavior
3. token visualization
4. text metrics
5. model catalog
6. pricing engine
7. context planning
8. cost forecast
9. tokens/words
10. GPU/VRAM
11. speed/latency
12. API
13. developer docs
14. auth
15. API-key lifecycle
16. billing/entitlements
17. dashboard
18. privacy
19. SEO
20. accessibility
21. mobile
22. observability
23. tests
24. deployment

Do not implement duplicate components until this matrix is complete.

---

# 8. Phase 3 — Reconcile architecture with existing code

The preferred architecture is not a mandate if the repository already has something better.

Target shape:

```text
Next.js App Router
React + TypeScript
        │
        ├── public pages
        ├── local calculator
        │      └── Web Worker tokenizer
        ├── server/API routes
        ├── authenticated app
        └── SEO content
               │
               ▼
       shared domain libraries
               │
       ┌───────┼─────────────┐
       │       │             │
 tokenizer  pricing       cost/context
 registry   catalog         engines
               │
               ▼
        Postgres + Drizzle
               │
       auth / billing / keys
```

Keep business logic out of page components.

At minimum centralize:

- tokenizer adapters
- text metrics
- providers/models
- pricing rules
- context logic
- workload/cost formulas
- API schemas
- entitlements

---

# 9. Phase 4 — Main calculator parity and improvement

The landing page must be an actual tool, not a marketing shell.

## Required interaction

```text
INPUT TEXT
   ↓
LOCAL TOKENIZATION
   ↓
TOKEN PIECES
   ↓
SUMMARY METRICS
   ↓
MODEL COST TABLE
   ↓
CONTEXT / COST INSIGHT
```

## Required result metrics

- tokens
- words
- characters excluding whitespace
- all characters

Nice-to-have if useful:

- lines
- bytes
- tokenizer family
- precision label

## UX requirements

- update quickly while typing
- debounce expensive work
- move expensive tokenization off the main thread
- do not freeze large inputs
- provide clear empty states
- preserve accessibility
- support keyboard-only use
- work at 320px width
- use semantic controls
- respect reduced-motion
- dark/light/system theme support

## Token-piece renderer

Avoid pathological DOM growth.

Use one or more:

- cap
- virtualize
- incremental rendering
- expandable detail

Whitespace must be understandable.

---

# 10. Phase 5 — Tokenizer registry

Do not claim one tokenizer is exact for every provider.

Implement/maintain a registry with a consistent result:

```ts
type TokenizerResult = {
  count: number;
  pieces: string[];
  ids?: number[];
  family: string;
  precision:
    | "exact"
    | "provider_reference"
    | "compatible_family"
    | "estimated";
};
```

Requirements:

- OpenAI-compatible local planning tokenizer where supported
- explicit precision metadata
- graceful fallback
- deterministic tests
- no network upload in the anonymous default path
- adapter registration independent of UI

If Anthropic/Gemini exact tokenization cannot be performed locally using a legitimate supported mechanism, do not invent it.

Instead:

- show a clearly labeled compatible estimate/reference
- optionally expose an opt-in provider-authoritative mode later

---

# 11. Phase 6 — Pricing/model catalog

A model price is a versioned fact with provenance.

Each model should support:

```ts
type ModelProfile = {
  id: string;
  provider: string;
  displayName: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  tokenizerFamily?: string;
  pricingSourceUrl: string;
  lastVerifiedAt: string;
  priceRules: PriceRule[];
};
```

Price rules must support:

- input
- cached input
- output
- optional cache write
- long-context thresholds
- service tier when needed
- effective dates

Do not blindly copy prices from the reference product.

Verify production model pricing from official provider sources.

Build tests around tier boundaries.

---

# 12. Phase 7 — Cost engine

Use shared pure functions.

Required formulas:

```text
input_cost =
  non_cached_input_tokens
  / 1,000,000
  × input_rate

cached_cost =
  cached_input_tokens
  / 1,000,000
  × cached_rate

output_cost =
  output_tokens
  / 1,000,000
  × output_rate

total_request_cost =
  input_cost + cached_cost + output_cost

monthly_cost =
  total_request_cost × monthly_requests
```

If a provider bills cached tokens differently, model that explicitly.

Do not silently double-count cached tokens.

Round only for presentation; retain useful precision internally.

---

# 13. Phase 8 — Context engine

Compute:

```text
input_total
reserved_output
context_window
remaining
utilization
overflow
```

Provide:

- visual utilization
- headroom
- warnings
- overflow state

Keep provider/message-overhead caveats honest.

---

# 14. Phase 9 — Model catalog and comparison UX

The model page should be useful without prompt input.

Required:

- search
- provider filter
- model name
- input price
- cached-input price
- output price
- context window
- pricing tier notes
- official source link
- last verified date where available

When workload data exists, add:

- request cost
- monthly cost
- rank
- savings delta

Do not rank on quality unless you have a defensible quality signal.

---

# 15. Phase 10 — Cost Lab

Build/retain a workload planner.

Inputs:

- input tokens
- cached tokens or cached %
- output tokens
- requests/day or requests/month
- growth assumption
- selected models

Outputs:

- per-request cost
- daily/monthly/annualized cost
- cheapest relevant models
- baseline vs alternative delta
- savings %

Useful presets may include:

- chat assistant
- coding assistant
- RAG query
- classification
- extraction
- summarization

Presets are starting assumptions, not factual benchmarks.

---

# 16. Phase 11 — Tokens ↔ words

Keep this a planning-range utility.

Do not imply an exact universal conversion.

Support:

- tokens → approximate word range
- words → approximate token range
- common token budget examples
- explicit variability disclaimer for language/code/JSON

---

# 17. Phase 12 — GPU / VRAM calculator

At minimum implement:

```text
weight_memory =
  parameters × bytes_per_parameter

estimated_runtime_memory =
  weight_memory × overhead_factor
```

Precision options:

- FP32
- FP16/BF16
- FP8/INT8
- 4-bit

Clearly explain omitted factors:

- KV cache
- activations
- batch size
- sequence length
- framework overhead
- tensor/pipeline parallelism
- quantization metadata

If advanced planning already exists, preserve it.

---

# 18. Phase 13 — Speed simulator

Inputs:

- TTFT
- tokens/sec
- output tokens

Formula:

```text
decode_seconds = output_tokens / tokens_per_second
total_seconds = ttft + decode_seconds
```

Render a streaming demonstration.

Never conflate TTFT and decode rate.

---

# 19. Phase 14 — Developer API

Preserve or improve:

```http
POST /api/v1/tokenize
```

Compatibility request:

```json
{ "text": "hello world" }
```

Improved optional request:

```json
{
  "text": "hello world",
  "model": "optional-model-id",
  "includePieces": false
}
```

Response should include stable count fields and optional tokenizer metadata.

Requirements:

- Zod or equivalent schema validation
- request-size limit
- structured errors
- no-store
- no raw prompt logging
- server timeout guard
- rate limit
- key/entitlement enforcement when production API access is enabled
- deterministic tests

Do not break the public endpoint just to add a new version.

If breaking changes become necessary, introduce versioning.

---

# 20. Phase 15 — Production API-key system

If existing implementation is incomplete, implement production semantics.

Key format can be product-specific; do not copy the reference prefix unless deliberately kept for compatibility.

Security:

```text
generate secret
    ↓
display once
    ↓
store:
prefix
last4
hash
metadata
    ↓
never recover full secret
```

Features:

- create
- name
- copy once
- revoke
- rotate
- last used
- scopes later
- per-plan quotas
- rate limit
- audit event

Never store plaintext keys.

---

# 21. Phase 16 — Authentication, organizations, projects

Use the auth architecture already selected in the repository.

The package currently includes WorkOS/AuthKit-related dependencies; verify actual implementation before adding another auth provider.

Minimum durable model:

```text
users
organizations
memberships
projects
saved_scenarios
api_keys
api_usage
subscriptions
entitlements
budgets
alerts
audit_events
```

Anonymous public tools must not become auth-gated.

---

# 22. Phase 17 — Billing and entitlements

The repository currently includes Stripe dependencies.

Use a server-authoritative entitlement model.

Implement:

- checkout
- customer portal
- webhook verification
- idempotent webhook handling
- subscription state sync
- plan mapping
- entitlement checks
- cancellation behavior
- clear not-configured state

Never trust client-side plan state.

Never fake payment success.

Reference pricing is research input, not a requirement for our final price strategy.

---

# 23. Phase 18 — Dashboard

Authenticated product should be task-oriented.

Suggested initial dashboard:

```text
Overview
Projects
Saved Scenarios
API Keys
Usage
Budgets
Integrations
Billing
Settings
```

Initial useful views:

### Overview
- current usage
- API calls
- estimated spend
- plan/quota state
- recent activity

### API Keys
- named keys
- prefix/last4
- created
- last used
- revoke

### Usage
- requests
- tokens
- model/provider if known
- estimated cost
- time filter

### Saved Scenarios
- reusable workloads
- selected models
- forecast
- comparison

Do not fill dashboards with fake charts before durable data exists.

---

# 24. Phase 19 — SEO and content architecture

The reference product's distribution strategy is part of the product logic.

Build high-value, independently written pages around:

- token calculator
- token cost calculator
- tokens to words
- model pricing
- context windows
- model/provider guides
- tokenization
- GPU memory
- LLM speed/latency
- developer API use cases

Every indexable page must be genuinely useful.

For programmatic model/provider pages:

- generate from canonical verified catalog
- include official pricing provenance
- avoid duplicated thin prose
- include calculator/comparison actions
- link internally

Technical SEO:

- metadata
- canonical
- sitemap
- robots
- OpenGraph
- structured data where appropriate
- performant server/static rendering
- accessible headings

---

# 25. Phase 20 — Privacy and security verification

Public calculator:

- prompt text stays in browser by default
- no analytics event contains prompt text
- no error tracker receives prompt body
- no server action silently receives text

Server API:

- request text processed only for response
- no body logging
- usage stores metadata/counts only by default
- secrets redacted
- appropriate retention policy

Add automated tests where practical.

Perform a bundle/env review for accidental secret exposure.

---

# 26. Phase 21 — Improve beyond the reference

After parity is solid, add improvements already consistent with Token Intelligence.

Priority order:

## P1 — Better calculator intelligence
- tokenizer precision labels
- xAI / DeepSeek / additional provider support
- official source provenance
- workload forecast
- context headroom
- shareable scenario state that excludes prompt text by default

## P2 — Developer product
- pricing/model metadata API
- TypeScript SDK
- Python SDK
- CLI
- API quotas / usage

## P3 — Team product
- organizations
- projects
- saved scenarios
- budgets
- alerts

## P4 — AI FinOps
- usage ingestion
- actual-vs-estimated reconciliation
- provider connectors
- project/team allocation
- anomaly detection
- optimization recommendations

## P5 — Agent economics / control
Respect the separate master prompt and existing architecture for:

- Agent Run Receipts
- MCP
- coding-agent integrations
- policy engine
- gateway
- enforcement
- outcome-aware savings

Do not shoehorn all P4/P5 functionality into the initial parity pass if it destabilizes the core calculator.

---

# 27. UX design direction

Do not clone the reference pixels.

Build a stronger, ownable visual system.

Desired feel:

- focused developer utility
- clean
- high information density where needed
- minimal chrome around calculator
- strong typography
- obvious privacy boundary
- excellent tables
- desktop and mobile first-class
- accessible color contrast
- polished empty/loading/error states

Avoid:

- generic dashboard card walls
- excessive gradients
- meaningless decorative charts
- giant hero areas that push the tool below the fold
- copycat brand marks

The calculator should be usable almost immediately after page load.

---

# 28. Testing requirements

At minimum:

## Unit

- tokenizer adapters
- text metrics
- cost math
- cached-token math
- price-rule selection
- long-context thresholds
- context utilization
- token/word conversions
- GPU memory formulas
- speed formulas
- entitlement logic
- API-key hashing helpers

## Integration

- tokenize API
- invalid body
- too-large body
- invalid API key
- revoked API key
- inactive entitlement
- quota behavior
- pricing catalog serialization
- webhook idempotency

## E2E

- anonymous calculator
- token visualization
- theme
- model search/filter
- Cost Lab
- tokens/words
- memory tool
- speed tool
- developer docs
- auth entry point
- API-key workflow when configured
- billing entry point when configured
- mobile critical flows

## Privacy regression

Assert anonymous calculator typing does not send prompt content to application APIs.

## Accessibility

Use automated a11y where available plus semantic/manual checks for the primary flows.

---

# 29. Performance requirements

Targets:

- no calculator UI blocking for normal inputs
- worker/off-main-thread tokenization for expensive work
- avoid huge token-piece DOM
- lazy-load heavy tokenizer assets when appropriate
- minimize client JS for content-only routes
- cache public immutable pricing/catalog assets appropriately
- no cache for private/API count responses
- optimized mobile loading

Measure rather than guessing.

---

# 30. Observability requirements

For server/API paths record only safe metadata.

Useful fields:

```text
request_id
route
status
latency
api_key_id
organization_id
project_id
token_count
model
pricing_version
error_code
```

Do not log:

- raw prompt
- bearer secret
- auth token
- billing secret
- provider secret

Unknown or estimated usage must be labeled accordingly.

---

# 31. Documentation deliverables

Update/create as implementation proceeds:

- `README.md`
- `REVERSE_ENGINEERING.md`
- `COMPETITIVE_PARITY.md`
- `IMPLEMENTATION_PLAN.md`
- `docs/PRODUCT_LOGIC_AND_FEATURE_PLAN.md`
- API docs
- privacy docs
- security docs
- deployment/runbook
- architecture decisions where materially useful

Docs must match code.

Do not claim a feature is production-ready if it is only scaffolded.

---

# 32. Git delivery discipline

Use focused commits.

Suggested sequence:

1. `docs: refresh live reference audit and parity matrix`
2. `refactor: centralize tokenizer pricing and cost domain logic`
3. `feat: close calculator and visualization parity gaps`
4. `feat: harden model comparison and context planning`
5. `feat: complete planning tool parity`
6. `feat: harden developer tokenize api and docs`
7. `feat: productionize auth organizations and api keys`
8. `feat: add billing entitlements and usage metering`
9. `feat: add saved scenarios and developer dashboard`
10. `feat: expand seo provider and model discovery surfaces`
11. `test: add privacy integration e2e and regression coverage`
12. `docs: finalize reverse engineering architecture and runbook`

Do not create empty commits merely to match the list.

Do not combine unrelated changes into one huge commit.

---

# 33. Required verification before completion

Run all available repository quality gates.

Expected baseline:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Also run, when configured:

```bash
npm run db:check
npm run db:verify
npm run sdk:build
npm run test:integration
npm run test:e2e
npm run verify
```

If a command requires unavailable production credentials:

- do not fake them
- run all credential-independent coverage
- clearly report the exact blocked verification
- ensure build-time configuration fails safely or provides documented local/test behavior

---

# 34. Definition of done — parity layer

Do not declare the clean-room reverse-engineering pass complete until:

- public calculator works anonymously
- prompt text remains local by default
- token pieces render
- token/word/character metrics render
- pricing comparison works
- cached-input price handling is correct
- long-context tiers are data-driven
- context planning works
- model catalog works
- Cost Lab works
- tokens/words tool works
- memory tool works
- speed tool works
- developer docs work
- tokenize API contract is tested
- responsive layouts are verified
- dark/light theme is verified
- SEO metadata/sitemap are verified
- privacy boundary is documented and tested
- current reference parity matrix is updated
- production build succeeds

---

# 35. Definition of done — SaaS layer

Do not claim SaaS completion until:

- auth is real
- organization membership is durable
- database migrations are real
- API keys are hashed and revocable
- subscription entitlement is server-authoritative
- billing webhooks are verified and idempotent
- API usage is metered
- raw prompt content is not stored by default
- dashboard uses durable data
- quotas are enforceable
- critical integration tests exist

---

# 36. Final completion report

When you finish a meaningful wave, output a concise implementation report with:

```text
BRANCH:
COMMITS:
FILES CHANGED:

REFERENCE AUDIT:
- routes reviewed
- behavior reviewed
- important differences found

IMPLEMENTED:
- ...

INTENTIONALLY DIFFERENT:
- ...

TESTS:
- lint
- typecheck
- unit
- integration
- e2e
- build

PRIVACY/SECURITY:
- ...

BLOCKERS:
- only real external/configuration blockers

NEXT HIGHEST-VALUE WAVE:
- ...
```

Do not end with vague statements like "more work can be done."

State exactly what is complete and exactly what is not.

---

# 37. Product north star

Do not lose sight of the product evolution.

The reference wedge asks:

> How many tokens is this text and what might it cost?

Token Intelligence should ultimately answer:

> **How much will this AI workload cost, what did it actually cost, where did the cost come from, and what should we change or enforce next?**

Build the free calculator exceptionally well first.

Then turn that traffic and developer trust into a durable developer API and AI FinOps product.
