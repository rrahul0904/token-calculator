# tokencalc-seven implementation gap matrix

Baseline: `main@508583184852a56faea44050ee399879db7fbb0c`
Implementation branch: `tokencalc-seven-vibe-implementation`
Reconciled: 2026-09-04

| Capability | Current repository | Gap | Decision |
|---|---|---|---|
| Shared cost engine | `src/lib/cost.ts` supports input/cache-read/cache-write/output and long-context tiers | No canonical percentage workload or reverse-budget math | Extend through a workload-economics layer; preserve existing API |
| Public Cost Lab | `/tools/cost` accepts explicit input/cached/output token counts | No reference-compatible URL state, mode switch, input %, cache-hit %, pinned baseline, share link | Upgrade existing component, do not add a second calculator |
| Authenticated Cost Lab | A/B browser-local prompt comparison and metadata-only scenario save | Not connected to public workload deep links or planned-vs-actual variance | Add workload handoff and reusable variance logic |
| Saved scenarios | Tenant-scoped `saved_scenarios` JSON metadata | No immutable scenario-version/pricing-snapshot identity | Add version metadata now; durable pricing snapshot tables in this wave |
| Models | Static verified model catalog and `/api/v1/models` | GLM-5.3-Flash/deep-link alias absent; model and inference endpoint conflated | Add Z.AI model and separate endpoint registry |
| Pricing provenance | Source URL/label + verified date on model | No immutable refresh snapshots or source-run status | Add pricing snapshot/source tables and OpenRouter refresh pipeline |
| OpenRouter | No first-class pricing adapter | Missing normalized routed model source | Add allowlisted OpenRouter API adapter; no arbitrary scrape URLs |
| Pricing refresh | Static application catalog | No periodic refresh/last-known-good persistence | Add cron-protected refresh that only publishes successful snapshots |
| Reverse calculation | None | Cost → tokens absent | Add piecewise-safe deterministic reverse solver |
| Cache modeling | Explicit cached token count | Cacheable fraction and hit probability conflated | Add simple compatibility mode + advanced cacheable/hit/write buckets |
| Pinned comparison | Cross-model estimates exist | No reference/pinned baseline semantics | Add pinned delta engine and UI |
| Endpoint economics | Gateway has provider connections | Pricing catalog lacks inference endpoints | Add endpoint catalog and API representation |
| Workload presets | Existing explicit-token presets | No canonical workload presets | Add editable chatbot/RAG/coding/research/data/extraction/batch presets |
| Quality frontier | None | No evidence-backed Pareto engine | Add generic frontier algorithm; only render quality axis when evidence exists |
| Estimate vs actual | Runs already store estimated/actual/reconciled cost and token buckets | No reusable scenario/run variance explanation | Add variance engine and authenticated scenario/run endpoint |
| Budgets/policy/gateway | Existing modules | No scenario-derived advisory handoff | Emit safe advisory budget/policy payload; never auto-enforce from public planner |
| API | `/estimate`, `/compare`, `/recommend` | No workload/reverse/frontier endpoint family | Add `/api/v1/economics/*` while preserving compatibility |
| SDK/OpenAPI | Existing SDK/OpenAPI | New economics contracts absent | Extend both |
| Tests | Cost/model/public E2E foundations | Workload/url/reverse/frontier/pricing-refresh coverage absent | Add unit + API/pipeline + E2E regression coverage |
| Privacy | Browser tokenization local; scenario saves metadata/hashes | Share state could leak content if poorly designed | Share serializer accepts only numeric/model planning metadata |
| External configuration | WorkOS/Stripe/DB/provider keys optional/config-dependent | OpenRouter refresh credential/config state absent | Add optional `OPENROUTER_API_KEY`; public model list source itself remains non-secret where supported |

## Implementation gates

1. canonical workload economics + URL codec
2. public bidirectional Cost Lab
3. endpoint/pricing provenance + OpenRouter last-known-good refresh
4. pinned comparisons + presets + evidence-safe frontier
5. saved scenario/run variance + advisory controls handoff
6. API/OpenAPI/SDK/tests/docs/operations

No production implementation should claim quality equivalence, measured performance, or live pricing unless evidence for that exact claim exists.
