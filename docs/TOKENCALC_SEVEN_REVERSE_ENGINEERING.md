# Vibe Reverse Engineering Dossier — tokencalc-seven

## Reference

Primary reference:
`https://tokencalc-seven.vercel.app/?model=glm-5.3-flash&mode=tokens2cost&tokens=1000000000&input=99&cache=98`

Public creator discussions reviewed on September 4, 2026:
- Reddit /r/vibecoding: “I made a website to calculate pricing and tokens”
- Reddit /r/DeepSeek: same product discussion

Supporting provider-economics reference:
- Vercel AI Gateway GLM-5.3-Flash model/provider page

This document records **observable product behavior and public statements** separately from implementation hypotheses.

---

# 1. Product idea

The reference product solves a practical question:

> “Given a token workload and cache-hit rate, what does this model actually cost, and how do other models compare?”

The creator publicly described the motivation as difficulty choosing models and repeatedly researching pricing. The product combines:
- model pricing research
- token volume
- input/output mix
- cache-hit assumptions
- cross-model cost comparison

This makes it closer to a **workload economics calculator** than a basic token counter.

---

# 2. High-confidence observable/publicly stated behavior

## 2.1 Shareable query state

The supplied URL exposes:

```
model=glm-5.3-flash
mode=tokens2cost
tokens=1000000000
input=99
cache=98
```

High-confidence inference from the public URL:
- selected model is URL-addressable
- calculation mode is URL-addressable
- total token volume is URL-addressable
- input percentage is URL-addressable
- cache percentage is URL-addressable
- a calculation can be shared/reopened without a server-side scenario ID

This is one of the strongest product decisions in the reference.

## 2.2 Tokens-to-cost mode

`mode=tokens2cost` explicitly indicates a tokens → cost calculation mode.

The existence of a named mode strongly suggests multiple calculator modes; public discussion also referenced a Tokens/$ control.

## 2.3 Cache-aware calculation

The creator publicly describes the product as calculating actual pricing based on:
- tokens
- cache-hit rates

This is materially more useful than a pricing table that assumes every input token is fresh.

## 2.4 OpenRouter-oriented catalog

In the creator discussion, the developer stated that all models available on OpenRouter had been added.

This implies:
- a broad multi-provider model list
- some normalized pricing representation
- a model catalog that changes independently from application code

## 2.5 Frequent pricing refresh

The creator stated that prices are updated every six hours server-side.

They also stated that manual values can be supplied because some providers block automated access.

This implies a pricing-maintenance workflow with at least:
- automated refresh
- server-side source handling
- manual fallback/override

It does **not** reveal the exact storage, scheduler, scraping, or API implementation.

## 2.6 Pinned/pegged model comparison

A user publicly requested:
- choose one model as a reference
- compare models with similar capability against it

The creator replied that the feature was added shortly afterward.

A follow-up asked for calculation transparency and the creator said the math was made visible on the site.

This indicates a rapidly evolving feature surface around:
- baseline/pinned model
- “same workload” comparisons
- disclosed calculation logic

## 2.7 Early-product quality issues

Public feedback on September 4, 2026 reported:
- total-cost and input-cost columns appearing identical in some states
- a Tokens/$ control being unresponsive
- concern that “same workload” comparisons did not always refresh meaningfully against capability-similar models

The creator acknowledged feedback and was actively updating the app.

Treat the reference as an idea/interaction benchmark, not as a correctness benchmark.

---

# 3. What is directly observable from the supplied deep link

The URL represents a scenario with:

```
model = glm-5.3-flash
mode = tokens2cost
total tokens = 1,000,000,000
input = 99
cache = 98
```

Likely interpretation to verify in browser:
- input = 99% of total tokens
- output = remaining 1%
- cache = 98% cache-hit/share of input using cached-input pricing

Do not hard-code this interpretation until browser behavior confirms it.

---

# 4. Likely public calculation model

A minimal implementation consistent with the product description is:

```
inputTokens = totalTokens × inputShare
outputTokens = totalTokens - inputTokens

cachedInputTokens = inputTokens × cacheHit
freshInputTokens = inputTokens - cachedInputTokens

cost =
  freshInputTokens × freshInputRate
+ cachedInputTokens × cachedInputRate
+ outputTokens × outputRate
```

Rates are normally normalized per 1M tokens.

This is a **behavioral hypothesis** until the reference site's published “math behind calculation” is captured directly.

---

# 5. Better production calculation model

The reference's simple cache-hit UX is valuable, but Token Intelligence should model production caching more accurately.

Separate:

```
cacheableInputPercent
×
cacheHitPercent
```

Then:

```
cacheableInput = input × cacheablePercent
cachedRead = cacheableInput × hitPercent
cacheMiss = cacheableInput - cachedRead
dynamicInput = input - cacheableInput
freshInput = dynamicInput + cacheMiss
```

Cost may include:
- fresh input
- cached read
- cache write/creation
- output
- reasoning tokens
- multimodal units
- long-context tiers
- provider-specific pricing rules

The existing Token Intelligence cost engine already supports cached reads and Anthropic-style cache write tiers, giving us a stronger base than the reference.

---

# 6. Model vs provider endpoint

A major limitation of a “one model = one price” calculator is that modern routed AI platforms can expose the same model through multiple inference providers.

Vercel AI Gateway's current GLM-5.3-Flash model page illustrates why the data model should separate:
- canonical model
- provider endpoint
- price
- cache rate
- context
- latency
- throughput
- uptime/reliability

Therefore Token Intelligence should model:

```
Model
  └── InferenceEndpoint
        └── PricingSnapshot
```

instead of only:

```
Model
  └── Price
```

---

# 7. Product strengths worth reproducing

## Frictionless
No account is required to model a scenario.

## URL-native
A calculation can be sent to another person as a link.

## Workload-first
The user thinks in total tokens and proportions rather than manually calculating three token buckets.

## Cache-first
Caching is treated as a first-class economic lever.

## Model comparison
The calculator is used for choosing a model, not only pricing a model already chosen.

## Rapid feedback loop
The product is small enough that requested comparison features can be added quickly.

---

# 8. Product weaknesses we should not reproduce

## Weak moat in raw arithmetic
The formula itself is easy to copy.

## Potential ambiguity around cache
“98% cache” can mean multiple things unless explained.

## Model equivalence risk
A cheaper model is not necessarily capability-equivalent.

## Pricing freshness risk
Six-hour updates are useful only if source provenance, failures, promotions, and stale data are handled correctly.

## Single-price model risk
Routed-provider economics can vary by endpoint.

## Early UI correctness issues
Public feedback indicates active bugs/rough edges.

## Lack of real-usage reconciliation
A calculator only predicts; it does not explain actual production spend.

---

# 9. Token Intelligence opportunity

Use the reference as the acquisition UX and connect it to our existing platform.

```
Public calculator
    ↓
Shareable scenario
    ↓
Pinned comparison
    ↓
Save to project
    ↓
Actual usage
    ↓
Run receipts
    ↓
Variance explanation
    ↓
Savings recommendation
    ↓
Budget/policy/gateway control
```

This turns a utility into a closed-loop AI FinOps product.

---

# 10. Reverse-engineering checklist for Codex

When implementing, Codex must browser-test the live reference and record:

## Calculator controls
- all modes
- input types
- ranges
- defaults
- reset behavior
- validation
- keyboard behavior

## URL
- parameter list
- canonical ordering
- live sync behavior
- invalid params
- back/forward

## Model catalog
- search
- filters
- provider grouping
- model metadata
- pricing fields
- similar-model logic

## Comparison
- pin behavior
- candidate selection
- sort behavior
- savings calculation
- refresh behavior

## Calculation explanation
- exact formulas shown
- rounding
- unit normalization
- cache assumptions

## Responsive
- desktop
- tablet
- mobile

## Errors
- missing prices
- zero prices
- invalid token counts
- unsupported caching
- model not found

Record each result as:
- Observed
- Inferred
- Unknown

---

# 11. Clean-room architecture hypothesis

A compact implementation could plausibly use:

```
Browser UI
  ↓
URL state
  ↓
Pure calculator engine
  ↓
Normalized model/pricing catalog
  ↓
Server-side scheduled pricing refresh
  ↓
Source adapters + manual overrides
```

This is only an independent architecture hypothesis.

Token Intelligence should keep its current broader architecture and integrate the useful behavior into existing cost/economics modules.

---

# 12. Build-vs-copy decision

Do not create a literal clone.

Build the following clean-room equivalent:

### Public parity
- shareable deep-link calculator
- tokens → cost
- cost → tokens
- input/output %
- cache hit %
- model search
- pinned comparison
- transparent math

### Better than parity
- cacheable % vs hit %
- cache writes
- price provenance
- immutable snapshots
- endpoint-aware pricing
- quality evidence
- Pareto frontier
- saved scenarios
- estimate vs actual
- budget/policy integration

---

# 13. Strategic product verdict

The reference validates a real developer pain point:
**model pricing is hard to reason about once workload shape and caching matter.**

The standalone calculator is useful but has low defensibility.

The defensible version is:

> **Workload economics + pricing intelligence + real usage + optimization + governance.**

That direction fits the existing Token Intelligence codebase better than building another standalone token calculator.
