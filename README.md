# Token Intelligence

A privacy-first LLM token, workload-economics, cost, context, latency, capacity-planning, and AI FinOps toolkit.

This repository is a clean-room implementation inspired by observable behaviors in public token-calculator products. It does not copy proprietary source code, branding, visual assets, or undisclosed implementation details.

## Current product surface

### Browser calculator
- local Web Worker tokenization
- OpenAI `o200k_base` planning reference
- token-piece visualization
- token, word, no-space character, and total character counts
- word-count and known-token planning modes
- input, cached-input, and output cost planning
- output-size presets
- context-window utilization
- automatic long-context pricing where modeled
- monthly request-volume forecasts

### Model economics
- searchable full model catalog
- OpenAI, Anthropic, Google Gemini, xAI/Grok, DeepSeek, and Z.AI profiles
- provider pricing-source links
- data-driven long-context tiers
- per-request and monthly cost comparison

### Planning tools
- `/tools/cost` — shareable workload Cost Lab with tokens → cost, cost → tokens, cache economics, pinned comparison, endpoint provenance, and workload presets
- `/tools/tokens-words` — token ↔ word planning ranges
- `/tools/memory` — GPU/VRAM weight-memory planner
- `/tools/speed` — TTFT + decode-speed simulator

### Developer/API surface
- `POST /api/v1/tokenize`
- `GET /api/v1/pricing`
- `GET /api/v1/models/:id/endpoints`
- `POST /api/v1/economics/estimate`
- `POST /api/v1/economics/reverse`
- `POST /api/v1/economics/compare`
- `POST /api/v1/economics/frontier`
- token/word/character counting with an explicit server-side privacy boundary
- workload economics, endpoint pricing provenance, and evidence-safe comparison contracts
- documentation at `/developers`

### Commercial surface
- `/pricing` packaging for Free / Pro / Team / Enterprise
- no fake checkout or fake subscriptions before billing infrastructure exists

## Product and reverse-engineering blueprints

The repository now has two complementary Codex execution tracks:

- [Product Logic & Feature Plan](./docs/PRODUCT_LOGIC_AND_FEATURE_PLAN.md) — canonical product loops, calculator/pricing/tokenizer/API logic, page map, domain model, SaaS roadmap, and quality gates.
- [Codex Vibe Reverse-Engineering Prompt](./docs/CODEX_VIBE_REVERSE_ENGINEERING_PROMPT.md) — clean-room end-to-end audit and implementation prompt focused on Token-Calculator.net parity plus deliberate improvements.
- [Agent Economics Platform Prompt](./docs/CODEX_AGENT_ECONOMICS_PLATFORM_IMPLEMENTATION_PROMPT.md) — later-stage AI FinOps, agent observability, MCP, gateway, policy, and enterprise evolution.
- [tokencalc-seven workload-economics dossier](./docs/TOKENCALC_SEVEN_REVERSE_ENGINEERING.md) — clean-room analysis of the shareable workload/caching/model-comparison reference.
- [tokencalc-seven product logic & features](./docs/TOKENCALC_SEVEN_PRODUCT_LOGIC_FEATURE_PLAN.md) — URL state, reverse economics, cache modeling, endpoint pricing, pinned comparison, presets, frontier, and FinOps linkage.
- [tokencalc-seven Codex prompt](./docs/CODEX_TOKENCALC_SEVEN_VIBE_REVERSE_ENGINEERING_PROMPT.md) — implementation contract for the workload-economics wave.

Use the vibe reverse-engineering prompt for the public product/parity pass. Use the Agent Economics prompt after the calculator/developer foundation is stable.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run db:check
npm run sdk:build
npm run build
```

The release workflow additionally applies migrations to disposable PostgreSQL, runs database integration tests, starts the production server, exercises the CLI, and runs Playwright production smoke tests.

## Privacy model

The public browser tokenizer keeps submitted prompt text in the browser and performs tokenization in a Web Worker. Workload Cost Lab share links contain planning metadata only—never prompt/source text. The developer API is a separate explicit server boundary. Authenticated scenario/run/usage infrastructure uses the repository's existing tenant-scoped persistence and metadata-only controls.

## Competitive audit

See [`COMPETITIVE_PARITY.md`](./COMPETITIVE_PARITY.md) for the current observable-feature comparison against Token-Calculator.net.

The clean-room reference audit must be refreshed before major parity work because model catalogs, pricing, public routes, and subscription packaging can change.

## Workload economics production wave

Example deep link:

`/tools/cost?model=glm-5.3-flash&mode=tokens2cost&tokens=1000000000&input=99&cache=98`

This wave adds URL-native workload scenarios, reverse budgeting, advanced cache economics, canonical model vs inference-endpoint identity, versioned pricing provenance, saved scenario versions, planned-vs-actual reconciliation, and advisory FinOps handoff.

Operations:
- [Workload economics runbook](./docs/TOKENCALC_SEVEN_OPERATIONS_RUNBOOK.md)
- [Pricing source architecture](./docs/TOKENCALC_SEVEN_PRICING_ARCHITECTURE.md)
- [Implementation status](./docs/TOKENCALC_SEVEN_IMPLEMENTATION_STATUS.md)

## Next production wave

The recommended next wave is an **Evidence-Calibrated Optimization Loop**: organization-owned evaluations, outcome-linked quality evidence, empirical cost/quality frontiers, verified model-switch recommendations, explicit apply/rollback workflows, and measured savings verification.


## Wave 1C.2 public-surface hardening

The calculator/developer surface now has:

- a canonical tokenizer registry with explicit `provider_reference` vs `estimated` precision
- model-aware context headroom and overflow states
- bounded token-piece inspection
- privacy-safe share links that never include pasted prompt text
- effective-dated pricing versions with historical/future resolution
- a hardened backward-compatible `POST /api/v1/tokenize` request supporting optional `model`, `includePieces`, and bounded `maxPieces`
- canonical public-site origin configuration, route-specific canonical metadata, provider breadcrumbs, and WebApplication structured data

See `docs/ADR_VERSIONED_PRICING_ENGINE.md` for pricing-version semantics.
