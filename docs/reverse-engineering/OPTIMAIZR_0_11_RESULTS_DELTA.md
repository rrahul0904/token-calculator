# optimAIzr 0.11 results/economics delta — REA clean-room dossier

Date observed: 2026-10-14  
Tracker: #73  
Implementation branch: `reverse/optimaizr-0-11-change-results`

## 1. Source and target identity

Source product: optimAIzr 0.11.0  
Canonical public repository: https://github.com/blendbunjaku/optimaizr  
Reddit discovery: https://www.reddit.com/r/SATNA_PROJECT/comments/1x632hv/i_built_an_opensource_tool_to_understand_and/  
License observed: MIT  
Target product: Token Intelligence

The donor is not being cloned. This delta uses public product behavior, changelog statements, and failure modes to derive Token Intelligence-native contracts. No donor source structure, command output wording, branding, UI, prompts, or proprietary hosted behavior is copied.

REA is a governed evidence/capability-discovery layer only. Token Intelligence remains authoritative for clean-room boundaries, provenance, privacy, implementation, verification, and release decisions.

## 2. Why this qualifies for Token Intelligence

The donor's useful 0.11 behavior is directly aligned with the existing optimization plane:

- record when an optimization change starts/stops;
- compare normalized usage before and after that change;
- wait for enough evidence instead of judging immediately;
- show confounders rather than pretending a raw before/after delta is causal;
- keep recommendation estimates separate from observed post-change outcomes;
- rank expensive sessions and show active-work time;
- show per-turn descriptive economics.

Token Intelligence already has normalized collectors, local usage scans, cost provenance, session metric receipts, findings, and an authoritative paired-run verification path. The product-fit decision is therefore **integrate as evidence contracts**, not build another scanner or another savings ledger.

## 3. Public behavior evidence

The 0.11 changelog states that the donor:

- compares days after a change with days before it;
- uses cost per prompt as a primary measure and includes calls per prompt, tool errors, calls past compaction, compactions, and summary wait time as diagnostics;
- waits for a minimum evidence floor before judging;
- names limitations such as short baseline, project shift, overlapping changes, and a trend that was already underway;
- journals changes and undo events locally;
- reports realised-savings metrics only from measured results rather than recommendation estimates;
- ranks costliest conversations and excludes long pauses from active time;
- reports duration/cost after turns.

These are treated as donor behavior statements, not as Token Intelligence proof.

## 4. Existing capabilities reused

Do not duplicate:

- `src/lib/optimization/local-usage-audit.ts`
- `src/lib/optimization/local-usage-scan.ts`
- `src/lib/optimization/local-session-metrics.ts`
- collector registry and telemetry schemas
- known/measured/estimated cost provenance
- paired-run experiment verification and `verifiedSavings`
- cache-risk work tracked separately in PR #65

## 5. Behavioral contracts recovered

### Change lifecycle

A change has:

- stable ID;
- rule ID;
- collector/agent scope;
- optional project scope;
- applied time;
- optional stopped/undo time;
- source (`token_intelligence` or `manual`).

The journal contains metadata only. It does not store prompts, code, tool payloads, transcript bodies, source paths, credentials, or provider configuration.

### Before/after evaluation

The evaluator:

1. accepts explicit normalized daily metrics;
2. chooses bounded pre/post windows;
3. scopes by collector and optional project;
4. requires a minimum number of active post-change days and prompt-equivalent units;
5. requires complete known-cost coverage on both sides for cost-per-prompt classification;
6. computes the observed cost-per-prompt delta;
7. reports companion diagnostics when available;
8. surfaces overlapping changes, project-mix shifts, and an obvious pre-existing downward baseline trend;
9. emits one of `insufficient_evidence`, `improved`, `worsened`, `neutral`, or `confounded`;
10. never calls that result verified or causal savings.

### Savings authority

A raw before/after delta is observational evidence only.

`observedCostDifferenceAtPostVolumeUsd` answers a narrow descriptive question: how much the post-period known cost differs from the cost expected at the pre-period cost-per-prompt rate and the same post-period prompt volume.

It is **not**:

- an invoice adjustment;
- a causal estimate;
- realised savings;
- verified savings.

True verified savings remains owned by Token Intelligence's existing paired-run / experiment evidence gate.

### Session economics

The session economics view:

- reuses the canonical local-session metric receipt for cost totals;
- exposes turns and descriptive per-turn cost/token metadata;
- reconstructs active duration from normalized activity timestamps;
- excludes gaps longer than the configured idle threshold;
- keeps subscription-window share unknown unless an independently compatible provider/account meter exists;
- never creates a competing session-cost ledger by summing partial turn costs over an incomplete canonical receipt.

## 6. Failure-mode analysis

### Sparse evidence

Risk: declaring success after one cheap day.  
Mitigation: minimum active-day and prompt-equivalent evidence floor.

### Missing cost becomes zero

Risk: artificial improvement when a post period has unpriced usage.  
Mitigation: complete cost coverage required for primary classification.

### Project mix changes

Risk: baseline and post periods contain different work.  
Mitigation: scoped comparison where possible; unscoped project-set change is a confounder.

### Multiple simultaneous changes

Risk: crediting one change for another change's effect.  
Mitigation: same-scope overlapping change windows produce `confounded`.

### Improvement was already underway

Risk: attributing an existing downward trend to the intervention.  
Mitigation: a clear downward split-baseline trend is surfaced as a confounder.

### Quality loss hidden by lower cost

Risk: lower dollars but more tool errors/retries or degraded task outcomes.  
Mitigation: tool-error/call/compaction diagnostics are shown where available, and no causal/verified savings claim is emitted. Outcome equivalence still requires the existing experiment gate.

### Session duration inflation

Risk: lunch/overnight gaps are counted as agent work.  
Mitigation: active duration excludes gaps over a configurable threshold (15 minutes by default).

### Fake subscription-meter precision

Risk: converting API-equivalent/local cost into a percentage of a provider subscription window.  
Mitigation: `subscriptionWindowSharePct` stays `null` without compatible provider-meter evidence.

## 7. Clean-room implementation in this branch

### `src/lib/optimization/change-effectiveness.ts`

Pure deterministic evaluator:

- no network;
- no filesystem;
- bounded policy;
- explicit evidence floor;
- cost-per-prompt primary outcome;
- diagnostics;
- confounder detection;
- no savings causality claim.

### `src/lib/optimization/change-journal.ts`

Local append-only journal:

- deterministic event/change IDs;
- applied/stopped events;
- metadata-only schema;
- restrictive local file mode where supported;
- malformed records skipped without echoing their contents;
- change-window reconstruction.

### `src/lib/optimization/session-economics.ts`

Metadata-only session/turn view:

- reuses `buildLocalSessionMetricReceipt`;
- active vs elapsed duration;
- cost coverage preserved;
- per-turn descriptive cost/token metadata;
- no provider quota/window guess.

### `scripts/change-results.ts`

Local CLI surface:

```bash
npx tsx scripts/change-results.ts record \
  --rule context-compaction \
  --collector claude \
  --project my-project

npx tsx scripts/change-results.ts list --json

npx tsx scripts/change-results.ts evaluate metrics.json --json

npx tsx scripts/change-results.ts stop --change change_...
```

No Token Intelligence API key is needed. The command performs no network request.

## 8. Input metric contract

`DailyOptimizationMetric` intentionally requires explicit normalized counts rather than re-reading raw prompt content:

- period start;
- collector;
- optional project ID;
- prompt-equivalent count;
- LLM call count;
- tool call count;
- optional tool error count;
- optional calls past context threshold;
- optional compaction count;
- optional compaction wait time;
- known cost;
- cost coverage.

The first wave accepts explicit daily metrics. A later integration may derive these from the existing local scan only after the prompt-equivalent/compaction semantics are certified per collector.

## 9. Verification matrix

Focused tests in this branch cover:

- supported improvement without causal/verified savings claims;
- insufficient post-change evidence;
- partial cost coverage staying unknown;
- overlapping changes becoming confounded;
- project-mix shift becoming confounded;
- neutral band;
- deterministic metadata-only journal IDs;
- stop requiring an existing change ID;
- journal deduplication;
- malformed-record privacy;
- restrictive local file permissions where supported;
- active-time idle-gap exclusion;
- canonical session-cost reuse;
- per-turn reported vs estimated labels;
- raw-content exclusion;
- costliest-session ranking.

Hosted CI must still prove typecheck, lint, tests, and repository security on the exact branch head.

## 10. Product integration roadmap

### Phase A — evidence core

Implemented in this branch.

### Phase B — local lifecycle journal

Implemented in this branch.

### Phase C — session economics

Implemented as a reusable domain module in this branch.

### Phase D — collector-derived daily metrics

Next after exact-head verification:

- derive prompt-equivalent counts only where collector semantics are defensible;
- add compaction/error diagnostics from normalized events without storing content;
- keep project attribution evidence-based;
- add integration fixtures for Claude and Codex separately.

### Phase E — unified Token Intelligence CLI

After domain contracts stabilize:

- route `ti changes ...` / `ti results ...` through the existing CLI;
- preserve local-only mode;
- expose JSON for automation/agent workflows.

### Phase F — dashboard / hosted metadata

Only after an explicit persistence/privacy review:

- store change receipts and aggregated metrics, not transcript content;
- show evidence maturity and confounders;
- never merge observational results into `verifiedSavings`.

### Phase G — experiment handoff

An `improved` and unconfounded observation may generate a recommendation to run the existing paired experiment. It must not auto-activate a setting or self-certify savings.

## 11. Release gates

This feature is not production-ready merely because focused tests pass.

Required before merge/release:

1. focused workflow green on exact head;
2. repository typecheck/lint/test/build gates green where applicable;
3. CodeQL/security green on exact head;
4. independent privacy review of journal/report output;
5. no regression to release-hardening work in PR #72;
6. merge only after the repository's broader release gates permit it.

## 12. Explicit non-claims

This branch does not claim:

- optimAIzr feature parity;
- donor benchmark reproduction;
- actual subscription savings;
- causal savings from before/after data;
- verified savings;
- automatic provider configuration changes;
- production deployment;
- support for every Claude/Codex history format;
- provider quota or five-hour-window inference.
