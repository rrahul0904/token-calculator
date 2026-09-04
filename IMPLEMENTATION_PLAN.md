# Token Intelligence implementation plan

## Wave 1 — Production calculator ✅

Implemented:

- local browser tokenization
- model pricing catalog
- input/cache/output cost math
- context-window planning
- monthly cost forecasting
- responsive UI
- production Vercel deployment

## Wave 1B — Token-Calculator.net competitive parity ✅

Implemented clean-room equivalents of useful observable features from the public reference product:

- token-piece visualization
- no-space and total character counts
- full searchable model pricing table
- automatic long-context tiers
- dedicated cost calculator / workload presets
- token ↔ word converter
- GPU RAM / VRAM calculator
- token-speed and TTFT simulator
- public-beta token-count API
- developer API documentation
- dark/light theme
- expanded application navigation
- Free / Pro / Team / Enterprise pricing packaging

Improvements over the reference:

- xAI and DeepSeek coverage
- shared schema-driven long-context pricing
- conservative tokenizer precision labels
- TTFT separated from decode speed
- explicit browser-vs-server privacy boundary

## Wave 1C — Live vibe reverse-engineering refresh

Execution artifacts:

- `docs/PRODUCT_LOGIC_AND_FEATURE_PLAN.md`
- `docs/CODEX_VIBE_REVERSE_ENGINEERING_PROMPT.md`

This wave is the clean-room product-quality audit before deeper SaaS expansion.

Goals:

- re-audit the current public Token-Calculator.net route and feature surface
- refresh `COMPETITIVE_PARITY.md` with live evidence
- validate the main calculator against empty/plain-text/Unicode/JSON/code/large-input cases
- verify token visualization, text metrics, pricing, long-context tiers, and context planning
- verify Cost Lab, token↔word, GPU-memory, and token-speed workflows
- verify responsive/mobile/accessibility behavior
- verify that anonymous prompt text remains browser-local
- verify API docs and public `POST /api/v1/tokenize` compatibility
- verify technical SEO, sitemap, metadata, internal linking, and provider/model discovery pages
- preserve deliberate improvements instead of pixel-copying the reference

Definition of done:

- parity matrix is current
- public tool regression suite passes
- privacy boundary has regression coverage
- production build passes
- docs describe any intentionally different behavior
- no working Wave 1 / 1B functionality is regressed


## Wave 1D — tokencalc-seven workload economics benchmark

Execution artifacts:

- `docs/TOKENCALC_SEVEN_REVERSE_ENGINEERING.md`
- `docs/TOKENCALC_SEVEN_PRODUCT_LOGIC_FEATURE_PLAN.md`
- `docs/CODEX_TOKENCALC_SEVEN_VIBE_REVERSE_ENGINEERING_PROMPT.md`

Goal:

Fold the useful observable behavior of the public tokencalc-seven workload calculator into the existing Token Intelligence Cost Lab, then improve it.

Scope:

- reference-compatible shareable query state
- tokens → cost and cost → tokens
- total-token + input/output percentage modeling
- cache-hit-first simple UX
- advanced cacheable-vs-hit/cache-write economics
- pinned/reference-model comparison
- pricing provenance and immutable versions
- OpenRouter/direct-provider source adapters
- canonical model vs inference-endpoint pricing
- workload presets
- model-efficiency/Pareto frontier when evidence exists
- save scenario + estimate-vs-actual FinOps connection

Do not create a second standalone calculator. Reuse `src/lib/cost.ts`, `src/lib/economics/**`, current authenticated Cost Lab, usage, runs, budgets, policy, and gateway foundations wherever they are already correct.

Definition of done:

- reference-style URL round-trips deterministically
- bidirectional calculation passes unit/E2E tests
- cache assumptions are transparent
- unknown price is never silently zero
- pricing provenance/freshness is visible
- pinned comparison works
- existing public/tokenizer features are not regressed
- advanced scenarios can connect to existing FinOps workflows
- lint/typecheck/tests/build pass


## Wave 2 — SaaS foundation

- authentication
- PostgreSQL
- users and organizations
- projects and saved scenarios
- prompt comparison history
- Stripe subscriptions
- billing portal
- plan entitlements
- hashed API keys
- quotas and usage records
- Cost Lab workspace redesign

SaaS constraints:

- anonymous free tools remain usable without sign-in
- API keys are shown once and stored as hashes, not reversible plaintext
- billing entitlement is server-authoritative
- API usage stores safe metadata/counts, not raw prompt text by default
- no fake payment/account success states when external configuration is absent

## Wave 3 — Developer and coding-agent integrations

- authenticated Streamable HTTP MCP server
- OAuth
- Codex integration
- Claude Code integration
- Cursor integration
- Google Antigravity integration
- TypeScript SDK
- Python SDK
- CLI
- GitHub Action / CI integration

Core MCP/API capabilities:

- estimate cost
- compare models
- check context
- recommend model
- check budget
- record usage
- retrieve usage
- identify savings opportunities

## Wave 4 — AI gateway / FinOps

- OpenAI-compatible and provider-specific gateway
- BYOK credentials
- actual usage reconciliation
- budgets
- model allowlists
- policy enforcement
- rate limits
- routing
- fallbacks
- estimated-vs-actual spend

The canonical FinOps loop is:

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

## Wave 5 — Enterprise

- SSO
- SCIM
- RBAC
- service accounts
- audit logs
- SIEM export
- retention controls
- dedicated deployments
- enterprise onboarding
- SLA and security documentation

## Cross-wave product rules

- keep the free calculator as the acquisition surface
- keep public prompt tokenization local-first
- label tokenizer precision honestly
- keep pricing versioned and sourced from official providers
- treat unknown prices as unknown, never zero
- do not fake external integrations
- keep business logic in shared domain modules rather than page components
- require lint/typecheck/tests/build for each production wave
