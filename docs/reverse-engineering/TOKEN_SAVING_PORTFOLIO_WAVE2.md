# Token-saving portfolio — Wave 2: structured encoding, prompt compression and caching

Tracking issue: #60  
Stacked implementation PR: #61

## Purpose

Wave 2 moves the portfolio from output/repository optimization into adjacent capability families while preserving one Token Intelligence evidence/control plane:

1. structured prompt encodings;
2. prompt/context compression;
3. exact/semantic response caching;
4. persistent memory/context continuity;
5. model-routing economics;
6. combination-level optimizer analysis.

The clean-room target is not donor parity. Token Intelligence owns the evidence, policy and economics boundary and can later plug independently reviewed implementations behind these contracts.

## Canonical sources verified

| Donor family | Canonical source | Observed product idea | Token Intelligence boundary |
| --- | --- | --- | --- |
| TOON | `toon-format/toon` and `toon-format/spec` | compact lossless encoding of JSON-shaped data, including tabular representation for uniform records | structured-encoding evidence and experiment contract |
| LEAN | `fiialkod/lean-format` | alternate token-oriented structured-data notation | structured-encoding competitor/benchmark donor |
| LLMLingua / LongLLMLingua / LLMLingua-2 | `microsoft/LLMLingua` | model-assisted prompt/context compression family | context-compression experiment donor; no Microsoft implementation copied |
| GPTCache | `zilliztech/GPTCache` | exact/semantic response reuse intended to avoid repeated model calls | semantic-cache evidence, freshness, isolation and quality gates |
| Mex | `mex-memory/mex` | durable agent/project memory and retrieval | persistent-memory provenance, freshness and isolation gates |
| RouteLLM | `lm-sys/RouteLLM` | route workload between models based on expected quality/economics | cost-routing evidence; never relabeled as token savings |
| LiteLLM | `BerriAI/litellm` | provider-neutral model gateway/router with budgets and fallbacks | existing Token Intelligence gateway/economics donor; no duplicate gateway |

All donor benchmark percentages remain upstream claims until reproduced by paired Token Intelligence evaluation.

## Source provenance controls

Canonical identity is stored separately from the original Reddit intake name in `src/lib/optimization/source-evidence.ts`.

Evidence confidence is one of:

- `verified` — exact donor identity is pinned;
- `family_reference` — authoritative source for the underlying technique, but not proof that the specific Reddit wrapper/plugin has been identified;
- `ambiguous` — multiple materially different projects match the intake name;
- `pending` — source identification is incomplete.

Examples:

- Microsoft LLMLingua, GPTCache, RouteLLM, LiteLLM and Mex are verified sources.
- TOON's official format/spec are family references for Reddit-specific plugin/MCP entries until those wrappers are independently identified.
- `Distill` and `Mnemos` remain ambiguous names and cannot be treated as exact donor evidence yet.

## Capability decomposition

### Structured encoding

TOON and LEAN attack representation overhead rather than agent reasoning itself. A compact representation can reduce payload tokens yet fail to reduce total session tokens when the model needs extra format instructions, loses fields, produces malformed structure, or retries.

Implemented: `src/lib/optimization/structured-encoding.ts`.

Payload savings and full-session savings are distinct. Format-instruction, repair and retry tokens are charged to the candidate; task-required fields and encode/decode fidelity must pass.

### Prompt/context compression

LLMLingua is a donor for a future compressor adapter, not a reason to embed donor code into Token Intelligence.

Implemented: `src/lib/optimization/context-compression.ts`.

The contract records original/delivered context, candidate session totals, auxiliary compressor-model input/output, recovery/retry overhead, compression latency, task-required evidence references and cache-prefix preservation. A good local compression ratio cannot become a verified claim if required evidence disappears or a prompt-cache boundary regresses.

### Semantic response caching

Implemented: `src/lib/optimization/semantic-cache.ts`.

Exact and semantic cache modes are distinguished. Tenant/authorization isolation, freshness and false-hit thresholds are correctness gates. Lookup, validation, false-hit recovery and provider-fallback tokens are charged to candidate economics.

### Persistent memory/context continuity

Implemented: `src/lib/optimization/persistent-memory.ts`.

Memory write/index/retrieval/recovery overhead is included. Stale memories, contradictory memories, missing task-required evidence, failed provenance or unverified tenant/project isolation block promotion even when repeated repository exploration decreases.

### Model routing and delegation

Implemented: `src/lib/optimization/routing-economics.ts`.

RouteLLM/LiteLLM/free-router/delegation techniques are explicitly classified as `cost_reduction_only`. A routed candidate can use more tokens and still cost less. Token Intelligence therefore records token delta as diagnostic evidence but always returns `tokenSavingsClaimable: false` for the routing-economics evaluator.

Exact provider/model provenance comes from gateway/provider telemetry; silent route substitution fails the gate.

### Combined optimizer plans

Implemented: `src/lib/optimization/optimizer-plan.ts`.

Individual component percentages are never added. Output reduction, retrieval, compression, caching, memory and routing can overlap or alter one another. The complete combination must be replayed/evaluated as one measured same-cohort candidate before any combined token-savings claim is surfaced.

### Unified portfolio analysis

Implemented: `src/lib/optimization/portfolio-analysis.ts`.

This facade gives supervisor/benchmark agents one metadata-only interface over output reduction, repository context, response density, structured encoding, semantic caching, context compression, persistent memory, routing economics and optimizer plans. Results normalize claim class, claimability, savings metric and remaining verification requirement while preserving the strict cost-only classification for routing.

The facade intentionally returns no aggregate savings percentage.

## Clean-room behavior contracts

1. Payload/context/output shrinkage is diagnostic evidence, not sufficient proof of session savings.
2. Structured encodings must preserve every task-required field and pass fidelity checks.
3. Format instruction, compressor-model, memory, lookup, repair, fallback and retry overhead is included where applicable.
4. Context compression must preserve required evidence and explicitly account for prompt-cache boundary changes.
5. Cache and persistent-memory data must be tenant/project/authorization isolated.
6. Cache/memory freshness and invalidation are correctness requirements.
7. Semantic false hits, stale/contradictory memories and retrieval misses are outcome failures even when they reduce provider calls.
8. Model routing can establish cost savings but never token savings without a separate measured token-reduction mechanism.
9. Same-cohort measured evidence plus quality gates are required for verified claims.
10. Component percentages are never summed; combined plans require plan-level measurement.
11. Donor savings percentages are never copied into Token Intelligence product claims.
12. Exact donor identity must be verified before source-specific implementation; family references may inform generic clean-room contracts only.

## Verification strategy

A dedicated `Token-saving portfolio contracts` workflow installs the locked dependency graph without mutating it, runs TypeScript typechecking, and executes the portfolio contract tests independently of the repository-wide production dependency audit.

At exact head `3e3d557897e7620756c8372905ce0a38a21e5989`, dedicated portfolio contracts and Security CodeQL passed. The repository-wide CI remained fail-closed at its production dependency audit because the existing lock graph contains high-severity advisories in `sharp <0.35.5` and `source-map-js <=1.2.1`; downstream lint/typecheck/full tests/build/browser stages were therefore skipped by the main workflow.

This dedicated workflow does not weaken the release gate. PR #61 remains draft until the dependency graph is safely regenerated/upgraded and a fresh exact-head repository-wide CI run completes.

## Next implementation wave

1. expose the unified portfolio analysis facade through the existing Token Intelligence MCP/agent surface;
2. add durable experiment/receipt linkage so evaluators can consume authoritative run evidence instead of caller-entered metrics;
3. continue canonical source identification across every remaining Reddit intake donor;
4. add plan recommendation logic that proposes experiments but never activates optimizers without policy/evidence gates;
5. integrate verified capability results into the existing findings/verified-savings UX rather than creating a parallel savings ledger.

## Non-claims

This wave does not claim parity with TOON, LEAN, LLMLingua, GPTCache, Mex, RouteLLM or LiteLLM; does not copy their source, prompts, UI, schemas or branding; and does not claim production savings. The code is an independently designed evidence/control layer for Token Intelligence.
