# TokenCalc Seven → Token Intelligence Product Logic & Feature Plan

Reference product:
`https://tokencalc-seven.vercel.app/?model=glm-5.3-flash&mode=tokens2cost&tokens=1000000000&input=99&cache=98`

Repository:
`rrahul0904/token-calculator`

Planning principle:
**Do not build a second calculator beside Token Intelligence. Fold the useful behaviors into the existing product and use them to strengthen the broader AI economics/FinOps platform.**

---

# 1. Product thesis

The reference product is best understood as a **shareable workload-cost calculator**, not merely a token counter.

The stronger Token Intelligence product should answer:

> Given this AI workload, what will it cost on each viable model and provider endpoint, how much does caching change the economics, what alternative is cheaper, and how does the plan compare with actual production usage?

The product loop becomes:

```
PLAN
  ↓
COMPARE
  ↓
SAVE
  ↓
OBSERVE ACTUAL
  ↓
EXPLAIN VARIANCE
  ↓
OPTIMIZE
  ↓
ENFORCE
```

---

# 2. What the reference behavior adds to the current repo

The existing repository already has:
- tokenization
- token visualization
- static model pricing catalog
- cached-input/cache-write/output cost engine
- cross-model estimates
- Cost Lab
- auth
- projects
- runs
- usage
- budgets
- billing/API keys
- policy engine
- gateway
- alerts
- MCP/integration foundations

The useful missing or underdeveloped ideas from the reference are:

1. **URL-native calculator state**
2. **Bidirectional tokens ↔ cost mode**
3. **Very fast percentage-based workload modeling**
4. **Cache-hit-first economics UX**
5. **Pinned/reference-model comparison**
6. **Broader routed model catalog**
7. **frequently refreshed pricing**
8. **easy share links**
9. **simple public calculator with no account requirement**
10. **calculation transparency**

We should implement these as a new economics layer, not duplicate existing modules.

---

# 3. Canonical public calculator state

A simple share link should be fully reconstructable from query parameters.

Minimum compatible state:

```
model=glm-5.3-flash
mode=tokens2cost
tokens=1000000000
input=99
cache=98
```

Token Intelligence should support the superset:

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

Rules:
- no prompt content in the URL
- invalid params fall back safely
- canonical serializer produces stable ordering
- browser back/forward works
- explicit “Copy share link”
- public anonymous use stays available

---

# 4. Core calculation logic

## 4.1 Simple token split

Given:
- total tokens `T`
- input percentage `I` between 0 and 1

```
inputTokens = T × I
outputTokens = T - inputTokens
```

## 4.2 Compatibility cache model

For reference-style simple mode:
- `cache` is interpreted as the share of input that receives cached-read pricing

```
cachedInputTokens = inputTokens × cacheHitPercent
freshInputTokens = inputTokens - cachedInputTokens
```

This preserves a simple one-control experience.

## 4.3 Advanced cache model

The production-accurate model separates:
- how much input is cacheable
- whether that cacheable part actually hits
- cache read price
- cache creation/write price

```
cacheableInputTokens = inputTokens × cacheablePercent
cachedReadTokens = cacheableInputTokens × cacheHitPercent
cacheMissTokens = cacheableInputTokens - cachedReadTokens
dynamicInputTokens = inputTokens - cacheableInputTokens
freshInputTokens = dynamicInputTokens + cacheMissTokens
```

Then:

```
totalCost =
  freshInputCost
+ cachedReadCost
+ cacheWriteCost
+ outputCost
+ reasoningCost
+ multimodalCost
```

Unknown price != zero.

## 4.4 Cost without cache

Always compute a baseline:

```
noCacheCost = inputTokens × freshInputRate + outputTokens × outputRate
```

Then:

```
cacheSavings = noCacheCost - actualCost
cacheSavingsPct = cacheSavings / noCacheCost
```

## 4.5 Cost → tokens

Given a budget and a fixed workload mix, solve the inverse of the cost function.

For simple linear pricing:

```
effectiveCostPerToken =
  inputShare × effectiveInputRate
+ outputShare × outputRate

totalTokens = budget / effectiveCostPerToken
```

For tiered pricing:
- solve piecewise
- report the tier(s) used
- never claim false precision

---

# 5. Pricing model

## Current state

`src/lib/models.ts` contains a static catalog with:
- provider
- context window
- max output
- pricing
- cache read/write pricing
- source URL
- verified date
- long-context tiers

This is a strong base.

## Target state

Split the data model into:

```
Canonical Model
        ↓
Inference Endpoint
        ↓
Pricing Snapshot
```

A model may have many provider endpoints with different:
- input cost
- cached-read cost
- cache-write cost
- output cost
- context
- latency
- throughput
- availability

---

# 6. Pricing intelligence pipeline

Target refresh cadence:
approximately every 6 hours where source terms and rate limits allow.

Pipeline:

```
Provider/OpenRouter source
        ↓
Fetch
        ↓
Normalize
        ↓
Validate
        ↓
Compare with previous snapshot
        ↓
Quarantine suspicious changes
        ↓
Manual reviewed overrides
        ↓
Publish last-known-good active snapshot
        ↓
Retain immutable history
```

Critical rules:
- no live scraping in the calculator request path
- a failed refresh cannot erase current pricing
- every published rate has provenance
- stale pricing is visibly labeled
- manual overrides are auditable and expiring

---

# 7. Product routes

## Public

### `/`
Keep the current tokenization experience.

### `/tools/cost`
Upgrade into the main shareable workload economics calculator.

Required:
- model search
- endpoint selection when relevant
- tokens → cost
- cost → tokens
- total tokens
- input %
- cache hit %
- advanced cache controls
- result breakdown
- cache savings
- pinned comparison
- share URL
- optional save scenario when authenticated

### `/models`
Upgrade catalog with:
- canonical model
- endpoint count
- pricing freshness
- source
- context
- cache support
- endpoint drilldown

### Optional `/compare`
Only add if it materially improves UX over an inline Cost Lab compare panel.

---

# 8. Authenticated product integration

## `/app/cost-lab`
Advanced scenario builder:
- workload presets
- editable assumptions
- pinned baseline
- provider endpoint constraints
- monthly volume
- scenario comparison
- saved versions

## `/app/usage`
Show:
- planned cost
- actual cost
- variance
- top variance drivers

## `/app/runs`
Link agent runs to:
- selected model
- endpoint
- cache behavior
- actual run cost
- planning baseline
- recommendation

## `/app/budgets`
Allow a saved workload to seed:
- monthly budget
- project budget
- per-run cap
- policy threshold

## `/app/integrations`
Pricing and usage connectors:
- direct providers
- OpenRouter
- gateway
- future telemetry sources

---

# 9. Pinned-model comparison

A user can select a reference model and pin it.

For the same workload show:

| Dimension | Baseline | Candidate | Delta |
|---|---:|---:|---:|
| Request cost | | | |
| Monthly cost | | | |
| Context fit | | | |
| Cache savings | | | |
| Input price | | | |
| Output price | | | |
| Quality | | | |
| Latency | | | |

Quality and latency rows only appear when evidence exists.

Comparison classifications:
- same model, different endpoint
- same model family
- evidence-backed comparable capability
- lower-cost alternative with no equivalence claim

---

# 10. Workload presets

Presets accelerate modeling but remain editable.

## Chatbot
- medium input
- short output
- moderate cache reuse
- high request count

## RAG
- long repeated instructions/schema
- retrieved context
- medium output
- high cache potential for static prefix

## Coding Agent
- long system/tool definitions
- multi-turn
- high context reuse
- medium/high output
- retries/fallbacks possible

## Research Agent
- long context
- many turns
- tool usage
- high output variance

## Data/SQL Agent
- schema-heavy context
- repeated metadata
- high cacheable prefix

## Document Extraction
- large input
- small structured output
- batch volume

## Batch Classification
- small output
- high request count
- batch pricing candidate

Each preset stores assumptions, not universal “truth”.

---

# 11. Model Efficiency Frontier

This becomes a key differentiation.

When trustworthy quality evidence exists, compute Pareto-efficient models across:

- cost
- quality
- latency
- throughput
- context
- reliability

Initial usable visualization:
**Cost vs Quality**

User selects:
- minimum quality
- maximum monthly budget
- minimum context

Output:
- cheapest qualifying option
- best value
- pinned baseline delta
- Pareto frontier

Do not invent quality scores.

---

# 12. Scenario persistence

Authenticated saved scenario:

```
Scenario
- organization
- project
- name
- workload assumptions
- selected model
- selected endpoint
- pinned model
- pricing snapshot id
- result
- created by
- created at

ScenarioVersion
- scenario id
- immutable assumptions
- immutable pricing snapshot reference
- result
- version
```

Why version scenarios:
A calculation must remain explainable after prices change.

---

# 13. Estimate vs actual

This is where the calculator becomes FinOps.

Variance model:

```
actualCost - plannedCost
```

Explain variance by:
- token volume
- input/output mix
- cache hit
- cache writes
- retries
- extra turns
- model change
- provider endpoint change
- long-context tier
- output expansion
- fallback

Example:

```
Planned: $1,850/month
Actual:  $2,430/month
Variance: +$580

+ $240 cache hit fell from 90% → 61%
+ $170 average turns increased 8 → 11
+ $110 provider route changed
+  $60 output tokens increased
```

---

# 14. Recommendations

Recommendation engine must be evidence-based.

Types:
- use cheaper endpoint for same model
- move to cheaper comparable model
- improve cacheability
- improve cache hit
- reduce repeated context
- use batch pricing
- lower max output
- route low-value tasks to cheaper model
- enforce per-run budget

Each recommendation records:
- baseline evidence
- estimated savings
- quality/risk assumptions
- pricing version
- confidence
- outcome after adoption when measurable

---

# 15. Data model additions

Adapt to the current Drizzle schema and avoid duplicates.

Likely concepts:

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
recommendation_outcomes
```

Use decimal/numeric types for durable monetary values.

---

# 16. API additions

Candidate public APIs:

```
GET  /api/v1/models
GET  /api/v1/models/:id/endpoints
GET  /api/v1/pricing

POST /api/v1/economics/estimate
POST /api/v1/economics/reverse
POST /api/v1/economics/compare
POST /api/v1/economics/frontier
```

Authenticated:

```
GET/POST /api/v1/scenarios
GET/PUT/DELETE /api/v1/scenarios/:id
```

Internal:

```
POST /api/internal/pricing/refresh
GET  /api/internal/pricing/status
```

Public APIs need rate limiting.
Internal refresh needs authenticated scheduler protection.

---

# 17. Feature priority

## P0 — Must build first

- reference-compatible URL state
- tokens → cost
- cost → tokens
- input/output percentage
- cache hit
- exact transparent breakdown
- share/copy link
- very large token support
- unit tests
- pinned model comparison
- pricing provenance/freshness

## P1 — Product differentiation

- cacheable % vs hit %
- cache-write economics
- dynamic versioned pricing
- OpenRouter catalog
- endpoint-aware pricing
- saved scenarios
- scenario versioning
- workload presets
- monthly forecast
- estimate vs actual

## P2 — Defensible intelligence

- provider endpoint performance
- quality evidence
- Pareto frontier
- recommendation engine
- savings verification
- pricing history charts
- budget-to-model recommendation

## P3 — Enterprise automation

- policy-from-scenario
- gateway routing optimization
- endpoint failover economics
- anomaly detection
- team/showback/chargeback
- automated verified savings workflows

---

# 18. UX principles

1. **Simple first**
   Show 4–5 controls, not a finance cockpit.

2. **Progressive disclosure**
   Advanced cache/provider assumptions go behind an advanced section.

3. **Explain every dollar**
   No opaque total.

4. **Shareability**
   The URL itself is a product feature.

5. **No false precision**
   Estimated tokenizers, inferred quality, stale pricing, and unknown rates are labeled.

6. **No account wall for planning**
   Sign-in is for saving, teams, actual usage, policies, and billing.

7. **Use the existing design system**
   Do not create a disconnected visual language.

---

# 19. Trust model

For every important number record where it came from.

Token/cost source labels:
- provider_measured
- gateway_measured
- collector_measured
- local_tokenizer_reference
- estimated
- reconciled

Pricing labels:
- official_provider
- OpenRouter
- manual_reviewed
- promotional
- stale
- unknown

Quality labels:
- benchmark_observed
- user_evaluation
- internal_eval
- unavailable

---

# 20. Success metrics

Public calculator:
- completed calculations
- copied share links
- model comparisons
- return users
- calculator → save scenario conversion

FinOps:
- actual usage connected
- cost under management
- forecast accuracy
- savings opportunities identified
- savings verified
- budget violations prevented
- percentage of spend with pricing provenance

Do not track prompt content.

---

# 21. Definition of the product after this wave

Token Intelligence should no longer be described only as:

> “A token calculator.”

It should be:

> **A workload economics and AI FinOps platform that lets developers model model/provider costs before deployment, compare alternatives under realistic caching assumptions, reconcile estimates with real agent usage, and turn validated savings into budget and routing controls.**
