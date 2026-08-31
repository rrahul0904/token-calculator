# Token Intelligence

A privacy-first LLM token, cost, context, latency, and capacity planning toolkit.

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
- OpenAI, Anthropic, Google Gemini, xAI/Grok, and DeepSeek profiles
- provider pricing-source links
- data-driven long-context tiers
- per-request and monthly cost comparison

### Planning tools
- `/tools/cost` — cross-model Cost Lab with workload presets
- `/tools/tokens-words` — token ↔ word planning ranges
- `/tools/memory` — GPU/VRAM weight-memory planner
- `/tools/speed` — TTFT + decode-speed simulator

### Developer API
- `POST /api/v1/tokenize`
- JSON token/word/character count response
- 500 KB request cap
- explicit server-side privacy boundary
- `Cache-Control: no-store`
- documentation at `/developers`

### Commercial surface
- `/pricing` packaging for Free / Pro / Team / Enterprise
- no fake checkout or fake subscriptions before billing infrastructure exists

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

A Vercel competitive-parity preview has passed Next.js production compilation, strict TypeScript validation, page-data collection, and static generation for the calculator, model catalog, pricing page, developer API, and planning tools.

## Privacy model

The public browser calculator keeps submitted prompt text in the browser and performs tokenization in a Web Worker. The developer API is a separate explicit server request and is designed not to retain submitted text. Durable account/API usage infrastructure is intentionally deferred until authenticated storage and billing are implemented correctly.

## Competitive audit

See [`COMPETITIVE_PARITY.md`](./COMPETITIVE_PARITY.md) for the current observable-feature comparison against Token-Calculator.net.

## Next production wave

The next wave turns the toolkit into a real SaaS / enterprise AI FinOps product:

- authentication and organizations
- Postgres-backed projects and saved scenarios
- Stripe subscriptions and entitlement enforcement
- API keys, quotas, and usage metering
- MCP server with OAuth
- Codex / Claude Code / Cursor / Antigravity integrations
- TypeScript and Python SDKs
- budgets and alerts
- RBAC, SSO/SCIM, audit logs
- provider gateway / routing and policy enforcement
