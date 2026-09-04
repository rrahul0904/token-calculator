# Codex Master Prompt — Vibe Reverse Engineer tokencalc-seven into Token Intelligence

## Mission

Continue the existing repository:

- Repository: `rrahul0904/token-calculator`
- Product: **Token Intelligence**
- Reference product to study clean-room: `https://tokencalc-seven.vercel.app/?model=glm-5.3-flash&mode=tokens2cost&tokens=1000000000&input=99&cache=98`
- Planning branch containing this prompt: `tokencalc-seven-vibe-reverse-engineering`

This is **not a greenfield clone**. The repository already contains a substantially broader AI economics/FinOps platform. Your job is to reverse engineer the useful observable behavior of the reference product, identify the gaps in Token Intelligence, implement only the missing capabilities, and improve them so the result is materially stronger than the reference.

The target product thesis is:

> **Given an AI workload, determine its true cost across models and provider endpoints, explain the economics, compare equivalent alternatives, and connect the result to real usage, budgets, policies, and optimization.**

The public calculator should remain frictionless and shareable. The authenticated product should turn those calculations into an AI FinOps control loop.

---

# 1. Non-negotiable clean-room boundary

Reverse engineer **observable behavior**, not proprietary implementation.

Allowed:
- public UI behavior
- public URLs and query parameters
- browser-visible text and controls
- accessibility tree / DOM rendered to the browser
- public network/API responses that a normal browser can access
- public documentation and provider pricing sources
- screenshots for behavioral comparison
- independent reimplementation of formulas and workflows

Do not:
- copy proprietary source code, bundles, minified internals, branding, artwork, copywriting, private APIs, secrets, or undisclosed implementation details
- bypass authentication or access controls
- reproduce trademarks or visual identity
- present inferred architecture as known fact

Document observed facts separately from hypotheses.

---

# 2. Start by inspecting the actual repository

Before changing code:

1. Fetch and inspect the latest `main` and this planning branch.
2. Read:
   - `README.md`
   - `IMPLEMENTATION_PLAN.md`
   - `REVERSE_ENGINEERING.md`
   - `COMPETITIVE_PARITY.md`
   - `AGENT_OBSERVABILITY_CONTROL_REVERSE_ENGINEERING.md`
   - `docs/CODEX_AGENT_ECONOMICS_PLATFORM_IMPLEMENTATION_PROMPT.md`
   - `docs/TOKENCALC_SEVEN_REVERSE_ENGINEERING.md`
   - `docs/TOKENCALC_SEVEN_PRODUCT_LOGIC_FEATURE_PLAN.md`
   - `package.json`
   - database schema/migrations
   - `src/lib/models.ts`
   - `src/lib/cost.ts`
   - `src/lib/economics/**`
   - `src/lib/gateway/**`
   - `src/lib/policy/**`
   - all relevant `src/app/**` routes and tests.
3. Inventory what is **working**, **partial**, **configuration-dependent**, and **missing**.
4. Do not reimplement a capability that already exists correctly.
5. Update stale documentation when repository reality differs from an older plan.

The repository already has significant foundations, including:
- Next.js/TypeScript
- local tokenization and token visualization
- model catalog
- input/cached-input/cache-write/output cost math
- long-context pricing support
- cross-model economics estimates
- Cost Lab
- authenticated application surfaces
- Postgres/Drizzle foundations
- auth, billing, API keys
- usage/run/budget surfaces
- collectors, policy engine, gateway, alerts
- MCP and developer integration foundations
- enterprise/security modules

Treat these as assets to extend, not replace.

---

# 3. Reverse-engineer the reference product first

Use a real browser and capture observable behavior at multiple viewport sizes.

At minimum test:

## 3.1 Deep-link state

Start with:

```
?model=glm-5.3-flash
&mode=tokens2cost
&tokens=1000000000
&input=99
&cache=98
```

Determine:
- how each query parameter maps to UI state
- default values when parameters are omitted
- invalid-value behavior
- max/min ranges
- whether state updates the URL live or only on explicit share
- browser back/forward behavior
- whether calculations are deterministic client-side

Implement equivalent **behavior**, not copied presentation.

## 3.2 Modes

Verify all observable modes, especially:
- tokens → cost
- cost → tokens
- any tokens-per-dollar / value mode
- model compare / pinned model behavior
- input/output mix
- caching controls

## 3.3 Model selection

Observe:
- search
- grouping
- provider labels
- pricing metadata
- context/capability indicators
- pin/peg/reference-model behavior
- comparison ordering
- handling of unavailable or zero-priced fields

## 3.4 Calculation explanation

Reverse engineer what is explained to the user:
- input tokens
- output tokens
- cached input
- uncached input
- cache savings
- total cost
- unit price
- tokens per dollar
- reverse calculation

Add an explicit transparent breakdown even if the reference is less clear.

## 3.5 Responsive UX

Verify:
- desktop
- tablet
- mobile
- keyboard behavior
- numeric input ergonomics
- large-number formatting
- share/copy flows
- loading/error states

Capture screenshots for internal comparison, but do not copy the visual design.

---

# 4. Product direction: calculator → workload economics → AI FinOps

Do not stop at parity.

The product progression is:

```
Shareable Token/Cost Calculator
          ↓
Model + Provider Economics
          ↓
Workload Simulator
          ↓
Pinned Comparable Models
          ↓
Cost/Quality/Latency Frontier
          ↓
Real Usage Reconciliation
          ↓
Savings Recommendations
          ↓
Budgets + Policy + Gateway Enforcement
```

The public calculator is the acquisition surface.
The existing authenticated Token Intelligence application is the system of record and control plane.

---

# 5. Canonical workload model

Introduce or normalize a single canonical workload model.

Minimum fields:

```ts
type WorkloadScenario = {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;

  inputPercent?: number;
  outputPercent?: number;

  cacheableInputPercent?: number;
  cacheHitPercent?: number;

  cachedInputTokens?: number;
  uncachedInputTokens?: number;
  cacheWrite5mTokens?: number;
  cacheWrite1hTokens?: number;

  requests?: number;
  requestsPerDay?: number;
  requestsPerMonth?: number;

  turnsPerRun?: number;
  retryRatePercent?: number;
  fallbackRatePercent?: number;

  reasoningTokens?: number;
  imageInputUnits?: number;
  audioInputUnits?: number;

  selectedModelId?: string;
  selectedEndpointId?: string;
  pinnedModelId?: string;

  mode: "tokens2cost" | "cost2tokens";
  budgetUsd?: number;
}
```

Do not make every field visible in the simple calculator. Use progressive disclosure:
- **Simple**: total tokens, input %, cache hit %, model
- **Advanced**: cacheable %, cache writes, turns, retries, provider endpoint, reasoning/multimodal units

---

# 6. Calculation engine requirements

Centralize all monetary math in tested pure functions.

## 6.1 Token split

For total token count `T` and input percentage `I`:

```
inputTokens = T * I
outputTokens = T - inputTokens
```

Normalize percentages safely and avoid floating-point presentation surprises.

## 6.2 Cache model

Do not confuse “cacheable input” with “cache hit”.

```
cacheableInputTokens = inputTokens * cacheableInputPercent
cachedReadTokens = cacheableInputTokens * cacheHitPercent
cacheMissTokens = cacheableInputTokens - cachedReadTokens
dynamicInputTokens = inputTokens - cacheableInputTokens
freshInputTokens = dynamicInputTokens + cacheMissTokens
```

Then model:
- fresh input price
- cached-read price
- cache-write price where applicable
- 5m / 1h cache-write tiers where applicable
- provider-specific semantics

If the simple calculator exposes only cache-hit percentage, preserve a compatibility rule and clearly document the assumption.

## 6.3 Total cost

```
totalCost =
  freshInputCost
+ cachedReadCost
+ cacheWriteCost
+ outputCost
+ reasoningCost
+ multimodalCost
```

Unknown price must remain **unknown**, not silently become zero.

## 6.4 Reverse calculation: cost → tokens

Implement deterministic reverse math for supported pricing structures.

Given:
- model/endpoint
- input/output split
- cache assumptions
- budget

solve for total tokens that fit the budget.

When pricing has thresholds or nonlinear tiers:
- solve piecewise
- surface assumptions
- include rounding strategy
- never claim false precision

## 6.5 Savings

Compute:
- cost without cache
- cost with cache
- absolute savings
- savings %
- cost per request
- cost per 1K / 1M / 1B tokens
- tokens per $1 / $10 / $100 where meaningful

## 6.6 Scale safety

Support very large values, including billions/trillions of tokens, without UI overflow or unstable arithmetic.
Use validated finite numbers and formatting helpers.

---

# 7. Shareable URL state

Implement durable, human-readable, account-free deep links.

Canonical public URL fields should include only non-sensitive planning metadata:

```
model=
endpoint=
mode=
tokens=
budget=
input=
cache=
cacheable=
requests=
pin=
```

Requirements:
- URL is source of truth on initial load
- malformed params fall back safely
- changing calculator state should use `history.replaceState` or equivalent without excessive navigation
- explicit “Copy share link” action
- do not include pasted prompt content in URLs
- preserve backwards compatibility with concise reference-style params
- test browser back/forward

Saved authenticated scenarios may have stable IDs, but public share links must remain usable without login when they contain no private content.

---

# 8. Dynamic model and pricing catalog

The current static catalog is useful but should evolve into a versioned pricing intelligence system.

## 8.1 Sources

Support:
- official provider pricing sources
- OpenRouter catalog/pricing
- manual reviewed overrides
- future provider endpoint telemetry sources

Prefer first-party pricing for direct-provider SKUs. Use OpenRouter for routed models/provider endpoints.

## 8.2 Refresh

Implement a server-side pricing refresh job with a target cadence of approximately six hours where source terms/rate limits allow.

Do not make the web request path depend on live provider scraping.

Pipeline:

```
fetch
→ normalize
→ validate
→ diff against previous snapshot
→ quarantine suspicious changes
→ apply reviewed overrides
→ publish active snapshot
→ retain history
```

## 8.3 Provenance

Every price must have:
- source URL/source key
- source type
- observed/fetched time
- effective time when known
- verification status
- currency
- unit
- stale-after policy
- optional confidence/review state

UI must show “last verified” and stale-data states.

## 8.4 Manual overrides

Manual pricing should:
- never overwrite history invisibly
- record reason
- record author/system source
- support expiration
- be auditable

---

# 9. Separate model identity from inference endpoint

The existing catalog mostly treats model and provider as one layer. Extend it.

Conceptual model:

```
Model
  ├── canonical identity
  ├── family
  ├── context window
  ├── capabilities
  └── quality/benchmark metadata

InferenceEndpoint
  ├── model_id
  ├── inference provider
  ├── region
  ├── input/output/cache prices
  ├── context override
  ├── rate limits
  ├── latency
  ├── throughput
  ├── uptime/reliability
  └── availability/status
```

A user should eventually be able to compare:
- same model, different provider endpoints
- different models, same workload
- direct provider vs OpenRouter route

Do not fabricate latency/throughput/uptime. Label observed, imported, benchmarked, or unavailable.

---

# 10. Pinned-model comparison

Implement a first-class “pin reference model” workflow.

User can:
1. select a baseline model/endpoint
2. pin it
3. see comparable alternatives under the same workload
4. compare:
   - request cost
   - monthly cost
   - savings
   - context fit
   - cache economics
   - quality score when evidence exists
   - latency/throughput when evidence exists

Comparison must distinguish:
- exact same model on another endpoint
- same family
- capability-equivalent / benchmark-near
- merely cheaper but not equivalent

Never imply equivalence without evidence.

---

# 11. Model Efficiency Frontier

Add a Pareto-frontier engine.

Dimensions may include:
- cost
- quality score
- latency
- throughput
- context window
- reliability

At minimum support cost vs quality when quality evidence exists.

Output:
- dominated models
- Pareto-efficient models
- baseline delta
- cheapest model above a chosen quality threshold
- best value under a monthly budget

If quality data is unavailable, omit the frontier rather than invent scores.

Architect quality as an evidence-backed adapter system so benchmark sources can be added later.

---

# 12. Workload presets

Provide useful presets that fill the calculator without hiding the underlying assumptions:

- Chatbot
- RAG
- Coding Agent
- Research Agent
- Data/SQL Agent
- Document Extraction
- Batch Classification
- Customer Support
- Voice/Realtime (only when pricing model is supported)

Each preset should define:
- input/output ratio
- expected context
- typical turns
- cacheable fraction
- expected cache hit
- requests/run volume

Presets are editable starting points, not authoritative benchmarks.

---

# 13. Existing FinOps integration

Connect the new planner to existing authenticated features.

## 13.1 Saved scenarios

Authenticated users can save a public-calculator scenario into a project.

Persist:
- workload assumptions
- pricing snapshot/version
- selected/pinned model
- selected endpoint
- calculated result
- optional tags/name

## 13.2 Estimated vs actual

When actual usage exists:
- compare planned vs actual tokens
- compare planned vs actual cost
- explain variance by model, cache, retries, turns, output, provider route

## 13.3 Budgets

Allow a scenario to become:
- a budget baseline
- a monthly forecast
- a policy threshold

## 13.4 Gateway

Use planner recommendations as advisory by default.

Only the existing governed gateway/policy path may enforce:
- model allowlists
- maximum request cost
- monthly budget
- endpoint routing
- fallbacks

## 13.5 Runs

Link a saved workload or recommendation to agent-run receipts where possible.

A user should be able to answer:
> “We planned $X, actually spent $Y, and the variance came from Z.”

---

# 14. Suggested data model

Use the existing database conventions and migrations. Adapt names to current schema rather than creating duplicates.

Target concepts:

```
models
model_capabilities
inference_endpoints
pricing_sources
pricing_snapshots
pricing_rates
pricing_overrides
pricing_refresh_runs

workload_scenarios
scenario_versions
scenario_results
scenario_comparisons

model_quality_evidence
provider_performance_snapshots

optimization_recommendations
recommendation_evidence
recommendation_outcomes
```

Important constraints:
- prices are decimal/numeric, not binary floating-point in durable storage
- snapshots are immutable
- active pricing points back to a snapshot/version
- recommendations record which pricing/evidence version generated them
- tenant-scoped records enforce organization isolation

---

# 15. API contract

Extend the existing API rather than creating an unrelated API.

Candidate endpoints, adjusted to current conventions:

```
GET  /api/v1/models
GET  /api/v1/models/:id/endpoints
GET  /api/v1/pricing
POST /api/v1/economics/estimate
POST /api/v1/economics/reverse
POST /api/v1/economics/compare
POST /api/v1/economics/frontier

GET  /api/v1/scenarios
POST /api/v1/scenarios
GET  /api/v1/scenarios/:id
PUT  /api/v1/scenarios/:id
DELETE /api/v1/scenarios/:id

POST /api/internal/pricing/refresh
GET  /api/internal/pricing/status
```

Public anonymous estimate endpoints must be rate-limited.
Internal refresh endpoints must be authenticated/cron-protected.

Update OpenAPI and SDK surfaces when endpoints become public.

---

# 16. UI / information architecture

Do not replace the existing application shell.

Public surfaces:
- `/` — current tokenizer calculator
- `/tools/cost` — upgrade into the shareable workload economics calculator
- `/models` — model + pricing catalog
- optional `/compare` — focused pinned-model comparison if it improves UX

Authenticated:
- `/app/cost-lab` — advanced workload lab and saved scenarios
- `/app/usage` — estimated vs actual
- `/app/runs` — run receipts and economics attribution
- `/app/budgets`
- `/app/integrations`

Public Cost Lab UX:

```
[Model / endpoint search]          [Pin baseline]

Mode: [Tokens → Cost] [Cost → Tokens]

Total tokens / Budget
Input %
Cache hit %
Advanced assumptions ▾

----------------------------------------------
Total cost
Fresh input
Cached read
Cache writes
Output
Savings from cache
----------------------------------------------

Compare alternatives
Model             Endpoint     Cost     Δ vs pinned
...

[Copy share link] [Save scenario]
```

Progressively reveal advanced controls. Keep the first experience fast.

---

# 17. Pricing freshness and trust UX

Pricing intelligence is useless if users cannot tell whether it is current.

Show:
- last verified timestamp
- source
- stale warning
- promotional/temporary pricing label
- manual override indicator when relevant
- endpoint-specific price when applicable

Do not claim “live” pricing unless it is actually live.
Use “refreshed”, “verified”, or “observed” accurately.

---

# 18. Implementation sequence

Create a new implementation branch from the latest planning branch:

`tokencalc-seven-vibe-implementation`

Work in these gates. Every gate must leave tests/build green.

## Gate 0 — Repository reconciliation
- inventory current features and migrations
- reconcile stale docs
- create gap matrix against this prompt
- no speculative rewrites

## Gate 1 — Workload economics core
- canonical workload schema
- pure token/cost/cache/reverse math
- pinned comparison primitives
- scale/rounding/unknown-price behavior
- unit tests

## Gate 2 — Shareable public Cost Lab
- query-state parser/serializer
- tokens→cost and cost→tokens
- input/output split
- cache hit
- advanced cacheable % and write costs
- share/copy
- mobile responsiveness
- accessibility
- E2E tests

## Gate 3 — Pricing intelligence
- normalized source adapters
- OpenRouter integration
- official/direct-source compatibility
- immutable price snapshots
- refresh job
- manual overrides
- provenance/freshness UI
- failure-safe last-known-good publishing

## Gate 4 — Model + endpoint comparison
- inference endpoints
- same-model provider comparison
- pinned baseline
- constraints
- comparison table
- evidence labels

## Gate 5 — Workload presets + frontier
- presets
- model efficiency frontier
- quality evidence adapter
- no fabricated quality data
- constraints and recommendation explanations

## Gate 6 — SaaS/FinOps connection
- saved scenarios
- project association
- estimated-vs-actual variance
- budget baseline
- run linkage
- advisory recommendation → gateway policy handoff

## Gate 7 — hardening
- performance
- security
- tenant isolation
- API rate limiting
- accessibility
- responsive layout
- migration safety
- CI
- docs/runbook

---

# 19. Testing requirements

## Unit
Cover:
- token split
- percent normalization
- cacheable vs cache-hit math
- cache read/write cost
- long-context tiers
- reverse budget calculation
- piecewise pricing
- unknown rates
- zero/negative/NaN/infinity rejection
- billion/trillion scale
- savings %
- Pareto frontier
- query-state parser/serializer

## Integration
Cover:
- pricing refresh adapter normalization
- stale/failed source fallback
- snapshot publication
- manual override precedence
- anonymous estimate rate limits
- authenticated scenario persistence
- tenant isolation
- pricing version linkage

## E2E
Cover:
1. open the reference-style deep link
2. state renders correctly
3. modify input %
4. modify cache hit
5. switch mode
6. pin a model
7. compare alternatives
8. copy share URL
9. reopen copied URL and verify equivalent state
10. sign in and save scenario when auth is configured
11. mobile flow

Use deterministic fixtures for provider APIs in CI.

---

# 20. Performance requirements

- Calculator interaction must feel instantaneous.
- Pure calculations run client-side where safe.
- Pricing catalog can be server-fetched/cached.
- Do not refetch the full catalog on every keystroke.
- Use memoization/derived state, not chained effect loops.
- Large model tables should filter/sort efficiently.
- Keep public Cost Lab JS payload reasonable.
- Never block calculator availability on pricing refresh; use last-known-good snapshot.

---

# 21. Security and privacy

- Never put prompt text in share URLs.
- Do not persist anonymous scenario content server-side unless explicitly requested.
- Treat provider keys as secrets and use existing encrypted credential patterns.
- Internal refresh endpoints require a cron secret or equivalent.
- Validate all query and JSON input with Zod or current project standard.
- Enforce organization boundaries at the data layer.
- Avoid SSRF in pricing-source adapters: sources must be allowlisted/configured.
- No arbitrary user-provided scrape URLs.
- Preserve existing privacy-first tokenization behavior.

---

# 22. Observability

Instrument without collecting prompt content by default.

Track:
- calculator mode
- model/endpoint selection
- compare action
- pin action
- share action
- pricing snapshot version
- pricing refresh success/failure
- source staleness
- estimate latency
- reverse-calculation errors
- recommendation generation
- saved scenario
- estimate-vs-actual variance computation

Do not send tokenized text or prompts to analytics.

---

# 23. Documentation changes required

Update:
- `README.md`
- `IMPLEMENTATION_PLAN.md`
- `docs/TOKENCALC_SEVEN_PRODUCT_LOGIC_FEATURE_PLAN.md`
- architecture/data docs as needed
- OpenAPI
- runbook
- env example for pricing refresh/OpenRouter if added

Keep a gap checklist with statuses:
- not started
- partial
- complete
- blocked by external configuration

---

# 24. Git discipline

- Never force-push.
- Never rewrite `main`.
- Work on `tokencalc-seven-vibe-implementation`.
- Use focused commits.
- Do not commit secrets.
- Keep migrations append-only unless a migration is unshipped and repository convention explicitly allows revision.
- Open a PR to `main` after implementation and verification.
- Do not merge unless explicitly instructed by the repository owner.

Suggested commits:
1. `docs: reconcile tokencalc-seven gap matrix and architecture`
2. `feat: add canonical workload economics engine`
3. `feat: add shareable bidirectional cost lab`
4. `feat: add pricing snapshot ingestion and provenance`
5. `feat: add model endpoint and pinned comparison`
6. `feat: add workload presets and efficiency frontier`
7. `feat: connect scenarios to finops usage and budgets`
8. `test: harden economics pricing and e2e coverage`
9. `docs: finalize pricing intelligence and operations runbook`

---

# 25. Definition of done

Do not call the work complete until all applicable criteria pass:

- Reference-style URL state works.
- Tokens → cost works.
- Cost → tokens works.
- Input/output split works.
- Cache-hit math is transparent.
- Advanced cacheable/cache-write model works.
- Large token volumes work.
- Pinned model comparison works.
- Endpoint-aware pricing model exists.
- Pricing provenance/version is visible.
- Refresh failure does not corrupt published pricing.
- OpenRouter/direct-provider sources are normalized where configured.
- Share URL round-trip is deterministic.
- Existing calculator/tokenizer features still work.
- Existing authenticated FinOps surfaces are not regressed.
- Unit/integration/E2E tests pass.
- `npm run lint` passes.
- `npm run typecheck` passes.
- `npm test` passes.
- database checks pass.
- SDK build passes if touched.
- `npm run build` passes.
- no secrets committed.
- documentation matches actual implementation.

If an external credential prevents live validation, implement the real path, test it using deterministic fixtures, document the exact configuration blocker, and continue with every other test that can run locally.

---

# 26. Final delivery report

At completion provide:

1. Branch name
2. Commit list
3. PR URL/number
4. Feature gap matrix: before → after
5. New/changed routes
6. New/changed tables/migrations
7. Pricing sources and refresh strategy
8. Calculation assumptions
9. Test/build results
10. External configuration still required
11. Known limitations
12. Recommended next production wave

The goal is not “clone the website.”

The goal is:

> **Use the reference product as a clean-room behavioral benchmark, then make Token Intelligence the more complete workload-economics and AI FinOps product.**
