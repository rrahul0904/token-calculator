# Full-Session Benchmark Integrity

## Source signal

This hardening pass was prompted by the public r/vibecoding benchmark discussion:

- https://www.reddit.com/r/vibecoding/comments/1wp1pto/i_benchmarked_repowise_codegraph_serena_graphify/
- Reviewed: 2026-09-24

The useful feedback is methodological rather than vendor-specific:

1. large single-payload compression ratios can collapse to much smaller savings over a complete agent session;
2. tool invocation behavior varies by harness, so a tool that is installed but rarely called cannot be credited with savings;
3. indexing/setup time is part of the tradeoff;
4. prompt-cache warming can invalidate naive cost comparisons;
5. retrieval coverage must be considered together with precision / amount of context served;
6. quality differences can be smaller than evaluator noise;
7. like-for-like paired workloads are more trustworthy than unrelated baseline and candidate samples.

Token Intelligence should therefore treat a savings percentage as the end of an evidence chain, not the starting metric.

## Product changes

### Verified savings now require paired cases

Baseline and candidate observations must reference the same unique evaluation case IDs. Duplicate rows for the same case and unpaired cohorts do not count as independent evidence.

### Verified savings now require complete session economics

Caller-submitted cost/tokens remain useful as exploratory observations, but they cannot create verified savings.

Eligible economics sources are authoritative, run-linked sources:

- linked run totals;
- governed orchestration totals across planner/executor/reviewer calls.

The measurement scope must represent the full agent/orchestration session rather than one retrieved payload.

### Cache and tool-call accounting are required

Each verified observation carries benchmark context derived from telemetry:

- cache-read tokens;
- cache-write tokens;
- total tool calls;
- target retrieval/tool identity and invocation count when the harness reports them;
- turn count;
- harness / agent identity where available;
- workflow identity where available;
- repository and commit where available;
- index/setup time when the harness reports it.

This lets the product distinguish “the tool exists” from “the tool was actually used,” and exposes cache behavior beside token/cost results.

### Index/setup time is disclosed, not silently ignored

Index time is not universally applicable, so it is not a universal pass/fail gate. Route/experiment evidence reports coverage for index/setup timing. Benchmarks for indexed tools should populate `benchmark.index_time_ms` in run metadata.

### Quality remains a gate

Paired, full-session savings still require non-inferior success and quality. A cheaper candidate that degrades the existing quality gate is rejected.

## Evidence labels

- **estimated / submitted observation**: useful for planning, never verified savings;
- **results recorded**: experiment data exists but one or more integrity / quality prerequisites are missing;
- **experiment verified**: paired cohort, full-session authoritative economics, cache/tool accounting, minimum sample, quality/success preservation, and lower cost all pass;
- **verified savings snapshot**: immutable versioned record of an exact verified evidence state.

## Recommended benchmark protocol

For agent/tool evaluations:

1. preregister the evaluation dataset and task types;
2. use the same task/case IDs for baseline and candidate;
3. keep repository commit, prompt, model/harness access, and other controllable inputs fixed where applicable;
4. record complete session usage, not only a retrieved payload;
5. record cache-read/write tokens;
6. record total tool-call count and instrument the benchmarked target tool separately;
7. record target-tool invocation rate so generic tool use is not misattributed;
8. record indexing/setup time when applicable;
9. evaluate quality separately from token/cost savings;
10. report medians and sample sizes together with the savings percentage;
11. preserve the full evidence hash so later changes trigger revalidation.

## Non-goals

This does not assert that any specific context/retrieval product saves a fixed percentage. External benchmark results remain source observations. Token Intelligence only promotes savings supported by the tenant's own controlled evidence.
