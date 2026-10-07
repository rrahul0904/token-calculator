# Token-saving portfolio — Wave 2: structured encoding, prompt compression and caching

Tracking issue: #60  
Stacked implementation PR: #61

## Purpose

Wave 2 moves the portfolio from output/repository optimization into three adjacent families:

1. structured prompt encodings;
2. prompt/context compression;
3. exact/semantic response caching.

The clean-room target is not donor parity. Token Intelligence owns the evidence, policy and economics boundary and can later plug in independently reviewed implementations behind those contracts.

## Canonical sources verified

| Donor family | Canonical source | Observed product idea | Token Intelligence boundary |
| --- | --- | --- | --- |
| TOON | `toon-format/toon` and `toon-format/spec` | lossless compact encoding of JSON-shaped data, including tabular representations for uniform records | structured-encoding evidence and experiment contract |
| LEAN | `fiialkod/lean-format` | alternate token-oriented structured-data notation with its own benchmark claims | structured-encoding competitor/benchmark donor |
| LLMLingua / LongLLMLingua / LLMLingua-2 | `microsoft/LLMLingua` | model-assisted prompt/context compression family | context-compression experiment donor; no Microsoft implementation copied |
| GPTCache | `zilliztech/GPTCache` | exact/semantic response reuse intended to avoid repeated model calls | semantic-cache evidence, freshness, isolation and quality gates |

All donor benchmark percentages remain upstream claims until reproduced by paired Token Intelligence evaluation.

## Capability decomposition

### Structured encoding

TOON and LEAN attack representation overhead rather than agent reasoning itself. A compact representation can reduce the number of tokens in a payload but still fail to reduce total session tokens when:

- the model needs extra format instructions;
- encoded structure loses a task-required field;
- the model produces malformed structured output that requires repair;
- unfamiliar syntax causes retries or clarification turns;
- a smaller representation reduces task accuracy.

Token Intelligence therefore records payload savings separately from full-session savings and requires encode/decode fidelity plus outcome-equivalent quality before claimability.

Implemented contract:

`src/lib/optimization/structured-encoding.ts`

Key fields include baseline/encoded payload tokens, baseline/candidate session tokens, format-instruction overhead, repair tokens, retry tokens, required/preserved fields, fidelity gate, quality gate and evidence type.

### Prompt/context compression

LLMLingua is a donor for a future compressor adapter, not a reason to embed donor code into the product. The existing Token Intelligence harness evaluator, Cost-Xray attribution, output-reduction contract and structured-encoding contract already establish most of the evidence boundary.

A future compressor adapter must additionally report:

- compressor/model identity and version;
- original and delivered context tokens;
- compression latency and any auxiliary-model usage/cost;
- protected content spans or required evidence references;
- cache-prefix changes;
- recovery/fallback behavior;
- full-session retries and quality results.

No prompt compressor should become automatic merely because its local compression ratio is favorable.

### Semantic response caching

GPTCache demonstrates a distinct optimization family: avoid provider generation when prior work can be reused. The dangerous failure is a cheap but incorrect cache hit.

Implemented contract:

`src/lib/optimization/semantic-cache.ts`

The evaluator treats the following as hard boundaries:

- tenant/authorization isolation must be verified;
- stale entries block promotion;
- false semantic hits must remain within the configured threshold;
- lookup, validation, false-hit recovery and provider fallback tokens are charged to the candidate;
- outcome quality must pass on the same workload;
- modeled/historical observations cannot become verified savings.

Exact cache and semantic cache are tracked separately because their correctness risks differ.

## Clean-room behavior contracts

1. Payload token reduction is diagnostic evidence, not sufficient proof of session savings.
2. Structured encodings must preserve every task-required field and pass round-trip fidelity checks.
3. Format-instruction, repair and retry overhead is included in candidate economics.
4. Prompt/context compression must preserve required evidence and disclose auxiliary compression-model usage.
5. Cache keys and values must be tenant/authorization isolated.
6. Cache freshness and invalidation are correctness requirements, not optional optimizations.
7. A semantic cache false hit is an outcome failure even if it avoided a provider call.
8. Cache lookup/validation/fallback/recovery costs are part of full-session economics.
9. Same-cohort measured evidence plus quality gates are required for `verified_savings`.
10. Donor savings percentages are never copied into product claims.

## Verification strategy

A dedicated `Token-saving portfolio contracts` workflow now installs the locked dependency graph without mutating it, runs TypeScript typechecking, and runs the optimization contract tests independently of the repository-wide production dependency audit.

This does not weaken the release gate. The main CI production audit remains fail-closed and currently requires the separately identified transitive dependency upgrades before the branch can become release-ready.

## Next implementation wave

1. provider-neutral context-compression receipt with auxiliary-model and cache-prefix accounting;
2. persistent memory/context-continuity evidence for Mnemos/Memstack/Mex-style donors;
3. model-routing economics contract that explicitly classifies cost savings separately from token savings;
4. unified optimizer plan evaluator that refuses to add overlapping component percentages and instead requires combination benchmarks.

## Non-claims

Wave 2 does not claim parity with TOON, LEAN, LLMLingua or GPTCache; does not copy their source, prompts, UI, schemas or branding; and does not claim production savings. The new code is an independently designed evidence/control layer for Token Intelligence.
