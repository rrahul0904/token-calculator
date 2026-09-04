# Token Intelligence

A privacy-first LLM token, workload-economics, cost, context, latency, capacity-planning, and AI FinOps toolkit.

This repository is a clean-room implementation inspired by observable behaviors in public token-calculator and AI-economics products. It does not copy proprietary source code, branding, visual assets, or undisclosed implementation details.

## Public product surface

### Browser calculator
- local Web Worker tokenization
- OpenAI `o200k_base` planning reference
- token-piece visualization
- token, word, no-space character, and total character counts
- word-count and known-token planning modes
- input, cached-input, cache-write, and output cost planning
- output-size presets
- context-window utilization
- automatic long-context pricing where modeled
- monthly request-volume forecasts

### Model economics
- searchable model catalog
- OpenAI, Anthropic, Google Gemini, xAI/Grok, and DeepSeek profiles
- provider pricing-source links
- data-driven long-context tiers
- per-request and monthly cost comparison
- cross-model economics estimation

### Planning tools
- `/tools/cost` — cross-model Cost Lab
- `/tools/tokens-words` — token ↔ word planning ranges
- `/tools/memory` — GPU/VRAM weight-memory planner
- `/tools/speed` — TTFT + decode-speed simulator

### Developer/API surface
- token-count API
- developer documentation
- OpenAPI foundations
- MCP/integration foundations
- TypeScript SDK build path
- privacy-safe telemetry/observability foundations

## Authenticated / AI FinOps foundation

The current repository also contains foundations for:
- authentication and organizations
- PostgreSQL/Drizzle persistence
- projects
- API keys
- billing
- usage
- agent runs
- budgets
- integrations
- alerts
- policy evaluation
- governed provider gateway
- quotas/rate limits
- collectors
- audit/security/enterprise controls

Some external integrations remain environment/configuration dependent.

## Current product direction

The next focused wave adds the best workload-economics behavior observed in the public `tokencalc-seven` reference and connects it to the existing FinOps platform:

- shareable URL-native scenarios
- tokens → cost and cost → tokens
- input/output percentage modeling
- cache-hit economics
- advanced cacheable-vs-hit/cache-write modeling
- pinned-model comparisons
- versioned pricing provenance
- OpenRouter/direct-provider pricing adapters
- canonical model vs inference-endpoint economics
- workload presets
- model efficiency/Pareto frontier
- saved scenario versions
- estimate-vs-actual reconciliation

See:
- [TokenCalc Seven reverse-engineering dossier](./docs/TOKENCALC_SEVEN_REVERSE_ENGINEERING.md)
- [Product logic & feature plan](./docs/TOKENCALC_SEVEN_PRODUCT_LOGIC_FEATURE_PLAN.md)
- [Codex vibe reverse-engineering implementation prompt](./docs/CODEX_TOKENCALC_SEVEN_VIBE_REVERSE_ENGINEERING_PROMPT.md)
- [Canonical implementation plan](./IMPLEMENTATION_PLAN.md)

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

Or run the repository verification gate:

```bash
npm run verify
```

## Privacy model

The public browser calculator keeps submitted prompt text in the browser and performs tokenization in a Web Worker. Server/API/integration surfaces have a separate explicit privacy boundary. Prompt/source content should not be collected by analytics or observability by default.

## Competitive research

- [Token-Calculator.net competitive parity](./COMPETITIVE_PARITY.md)
- [Original reverse-engineering dossier](./REVERSE_ENGINEERING.md)
- [Agent observability/control reverse engineering](./AGENT_OBSERVABILITY_CONTROL_REVERSE_ENGINEERING.md)

## Product destination

Token Intelligence is evolving from a calculator into a closed-loop AI economics platform:

```
PLAN
  ↓
COMPARE
  ↓
OBSERVE
  ↓
RECONCILE
  ↓
OPTIMIZE
  ↓
ENFORCE
  ↓
VERIFY
```

The target question is no longer only “How many tokens will this cost?”

It is:

> **What will this workload cost, which model/provider endpoint gives the best economics for my requirements, what did production actually spend, why did it differ, and what should the platform enforce next?**
