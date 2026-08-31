# Token Intelligence — Implementation Roadmap

## Wave 1 — Working production slice

Status: implemented on `implementation-v1`.

- Next.js App Router application.
- Local-only tokenizer worker.
- OpenAI `o200k_base` token counting.
- Clearly marked estimated token counts for other provider families.
- Multi-provider versioned pricing catalog.
- Cached-input and output cost math.
- Context-window warnings.
- Monthly request-volume forecasting.
- Token-boundary inspector.
- Unit tests and CI.

## Wave 2 — Cost Lab

- Two-column prompt variant comparison.
- Percentage and absolute token/cost deltas.
- Saved local scenarios with IndexedDB.
- Batch file analysis for `.txt`, `.md`, `.json`, and source code.
- CSV/JSON export.
- Model filters by context, price, and provider.
- Perplexity search/reasoning/citation fee modeling.
- Prompt compression suggestions without uploading source text by default.

## Wave 3 — Team economics

- Optional authentication.
- Projects, environments, budgets, and alert thresholds.
- Usage import adapters for provider billing/usage exports.
- Daily/weekly cost dashboards.
- Cost-per-feature and cost-per-customer tags.
- Budget anomaly alerts.
- Historical pricing snapshots and repricing simulations.

## Wave 4 — Developer platform

- Public calculation API that accepts counts rather than prompt text by default.
- TypeScript/Python SDKs.
- CI budget gate for prompt fixtures.
- Model-routing recommendations constrained by budget/context.
- MCP/tool interface for coding agents.

## Product principle

The defensible product is not merely a token counter. The target is an LLM economics workspace: model-aware token intelligence, cost forecasting, budget control, and prompt/model tradeoff analysis.
