# RE-353 — Bough historical agent-work reconstruction donor

**Status:** public-source reverse-engineering dossier; native Token Intelligence implementation not started  
**Canonical destination:** Token Intelligence (`rrahul0904/token-calculator`)  
**Owned issue:** #50  
**Research snapshot:** 2026-09-30  
**Upstream:** https://github.com/nickelsec/bough  
**Upstream main audited:** `c0ed6134dc8ec115d73dd3c2be410a1d29d34bb5`  
**Upstream license:** MIT  
**Primary requested thread:** https://www.reddit.com/r/vibecoding/comments/1wu2o6j/need_feedback_would_you_guys_find_this_tool_useful/

## Executive decision

Bough is worth tracking, but it should **not** become another standalone Token Intelligence product.

The closest existing donor is RE-231 / cost-xray. The scopes are complementary:

| Donor | Primary evidence plane | Distinctive value |
|---|---|---|
| RE-231 / cost-xray | live/wire request flow | request/context/cost attribution and reconciliation |
| RE-353 / Bough | local historical agent artifacts | retrospective prompts → tasks → sittings, file/commit/churn links, task-level API-equivalent cost |

RE-353 therefore belongs in the existing Token Intelligence repo as a historical-work reconstruction capability.

This dossier is intentionally behavior- and contract-oriented. No Bough UI, source structure, prose, fixture corpus, or private data is copied into Token Intelligence. Upstream is MIT, but an independently authored Phase A is still preferred so our domain model is compatible with existing Token Intelligence receipts, privacy rules, and collector semantics.

## What Bough publicly does

Bough reads local coding-agent history and turns it into a navigable record of work rather than leaving users with raw JSON/JSONL session files.

The public product surface includes:

- Claude Code, Codex CLI, and Pi history adapters.
- project selection and agent selection.
- an interactive browser timeline.
- text output and JSON output.
- each human prompt and the work attributed to it.
- inferred task boundaries.
- larger contiguous work periods called sittings/goals.
- file touches, edits, line churn, errors, delegation, and model/token data.
- agent-reported commits enriched from the local Git repository.
- token and API-rate cost summaries.
- sparse links between sittings that returned to the same work.
- local-only operation; the browser server binds to loopback.

The public README also distinguishes API-rate equivalents from bills. This matters: a subscription user can have a large API-equivalent figure without having paid that amount.

## Source architecture observed

The upstream implementation is a Go application with deliberately separated layers:

- `internal/agent`: agent-specific parsing plus provider-neutral `Source`, `Session`, `Turn`, token, delegation, and commit structures.
- `internal/agent/claude`: Claude Code history parser.
- `internal/agent/codex`: Codex CLI rollout parser.
- `internal/agent/pi`: Pi session parser.
- `internal/segment`: deterministic task segmentation.
- `internal/rollup`: sitting aggregation, labels, and cross-sitting links.
- `internal/metrics`: span, active time, file/edit/error/churn and heuristic struggle summaries.
- `internal/repo`: read-only local Git enrichment.
- `internal/price`: model/rate lookup and cost calculation.
- `internal/graph`: versioned browser/JSON graph contract.
- `internal/server`: embedded UI served on `127.0.0.1`.
- `cmd/bough`: CLI selection and output modes.

The architectural pattern worth retaining is the **normalization seam**: everything above the agent adapters operates on normalized turns instead of importing agent-specific storage details.

## Transcript normalization observations

The shared turn model preserves more than a typical cost-only receipt:

- user prompt or delegated task label
- timestamp
- files touched
- files edited
- line-change magnitude
- errors
- token classes
- model-specific token classes
- delegation/sub-agent work
- commit evidence
- explicit segment hints such as compaction

Token accounting distinguishes at least:

- fresh/input tokens
- output tokens
- cache-read tokens
- cache-write tokens

That distinction is important because context re-read can dominate historical cost. A single undifferentiated token total loses the evidence needed to explain where the spend came from.

## Task segmentation — observed algorithm

Bough does not claim that coding-agent histories contain canonical task boundaries. It infers them.

Published upstream defaults include:

| Signal | Upstream default | Role |
|---|---:|---|
| long pause | 45 minutes | strong boundary |
| compaction-associated pause | 20 minutes | strong boundary |
| file-set similarity | 0.10 | weak divergence signal below threshold |
| topic-word similarity | 0.08 | weak divergence signal below threshold |
| minimum files for file signal | 3 | suppresses tiny-set noise |
| long run | 10 turns | after this, one weak signal may be sufficient |
| recent comparison window | 8 turns | compares against recent work rather than the entire task |
| substantive prompt length | 80 chars | avoids over-weighting short continuations |

The normal rule is:

1. A sufficiently long pause is enough to split.
2. A compaction combined with a shorter pause is enough to split.
3. File divergence and topic divergence are weaker signals and normally need to agree.
4. On a long-running task, one weak signal can eventually cut so unrelated work does not merge forever.
5. Very short continuation prompts are poor topic evidence.

The boundary record retains reasons such as `gap`, `compaction`, `files`, and `topic`.

### Critical limitation

The tuning document says the thresholds were fitted against **one developer's history** and calls that the central weakness of the project.

That limitation is not incidental. It means Token Intelligence must not transplant the constants and then claim reliable task detection. Our contract should store:

- algorithm identifier/version
- configuration/threshold version
- evidence that caused each boundary
- deterministic reconstruction ID
- optional confidence/quality metadata
- coverage/limitations

This lets a later algorithm rebuild the same source history without pretending old boundaries were facts.

## Sittings / goals

Bough separates task boundaries from larger contiguous work periods.

The observed sitting break is six hours. A later return to the same files becomes another sitting instead of reopening the old one. Cross-sitting links express that the work is related without rewriting chronology.

That is a useful distinction for Token Intelligence:

- **task:** inferred unit of intent/work inside a session history.
- **sitting:** contiguous period in which work happened.
- **link:** evidence that two sittings touched the same underlying work.

This avoids a common mistake: grouping distant work into one pseudo-session simply because it looks semantically similar.

## Cross-sitting links

The upstream link logic is intentionally sparse:

- links are based on shared edited files;
- ambient plan/memory/tool-owned files are excluded;
- minimum link weight is two;
- weight uses shared work rather than allowing one extremely busy sitting to dominate.

For Token Intelligence, the important requirement is **evidence-linked relationships**, not this exact formula.

A future `HistoricalWorkLink` should carry:

- from/to sitting refs
- evidence type
- normalized resource refs
- link strength
- policy/algorithm version
- redaction state

## Activity and churn metrics

The upstream summary distinguishes wall-clock span from active time.

Observed behavior:

- span covers the first-to-last turn interval;
- active time only adds nearby intervals;
- the active-gap threshold is 20 minutes.

File churn is represented separately from line volume. The source comments explain why: a generated file can contain hundreds of changed lines without implying difficulty, while repeatedly revisiting one file can indicate iteration/friction.

### Heuristic struggle score

The upstream implementation contains a 0–1 heuristic score combining approximately:

- 55% normalized maximum file-edit churn
- 30% prompt-per-file density
- 15% error share

The tuning notes explicitly treat this as a guess validated against the author's own memory and keep it disabled by default.

**Token Intelligence should not implement or expose a "struggle" score in Phase A.**

If later research justifies a friction signal, it should be:
- separately named,
- evidence-backed,
- calibrated across a consented/multi-user corpus,
- decomposable into its components,
- and never presented as a psychological assessment.

## Commit reconciliation

This is one of the strongest donor ideas.

Agent history can say a commit occurred, but agent transcripts are incomplete evidence:
- hashes may be absent;
- quiet command output can omit details;
- a person can commit manually outside the agent;
- commits may later be rebased or amended.

Bough therefore reads the local Git repository and enriches commit evidence with repository facts such as:
- SHA
- subject
- timestamp
- added/removed line counts
- file count
- confirmation that the commit still exists

The Token Intelligence version should treat this as an evidence reconciliation problem, not a binary "commit/no commit" field.

Suggested states:

- `agent_reported_confirmed`
- `agent_reported_unresolved`
- `repository_correlated`
- `repository_manual_or_external`
- `rewritten_or_missing`
- `repository_unreadable`

All Git access in Phase A should be read-only and project-scoped.

## Cost semantics

Bough preserves token classes and model attribution, then uses published rates to calculate API-equivalent estimates.

Token Intelligence must keep stronger provenance because it already distinguishes measured, reconciled, and estimated economics.

A historical cost receipt should retain:

- model identifier observed in source
- token classes observed
- usage evidence source
- pricing source/version/effective date
- estimated USD
- measured/reconciled USD if separately available
- coverage = complete / partial / none
- missing-price models
- limitations

Rules:

1. Unknown price is **unknown**, not zero.
2. Local/free provider behavior can be represented as zero only with explicit pricing evidence.
3. Estimated API-rate cost is never described as a subscription bill.
4. Partial pricing must not become a full task/sitting total.
5. Historical cost should reuse Token Intelligence pricing/version infrastructure where available rather than embed a second authority.

## Privacy boundary

Raw coding histories can contain:
- prompts
- code
- file paths
- tool outputs
- repository names
- secrets accidentally printed by tools
- proprietary project context

The donor product is local-first, but merely running locally is not enough for Token Intelligence's privacy contract.

Phase A should default to metadata-minimized receipts:
- hashed/stable source refs
- no raw prompt text
- no raw source paths
- no tool output
- no code snippets
- no automatic upload
- no semantic embedding of raw content

An explicit opt-in inspection mode may expose prompt text in the local UI without persisting it into durable telemetry.

## Community feedback captured

### Supplied r/vibecoding post

The creator asks whether the product would be useful and presents the retrospective timeline/cost/commit/file-search workflow. The same post discloses that the task-boundary tuning came from the creator's own projects.

Engineering consequence: task segmentation must be an inspectable, versioned heuristic.

### Creator crossposts

Creator descriptions reinforce that task grouping is inferred locally and does not require another model call.

Engineering consequence: the deterministic offline path should be the baseline. An LLM-based semantic enrichment layer, if ever added, belongs behind a separate opt-in capability.

### Cursor community feedback

A Cursor crosspost produced a concrete gap: commenters expected Cursor support, while the current Bough agent registry supports Claude Code, Codex, and Pi.

Engineering consequence: do not claim Cursor support. Keep adapter contracts provider-neutral so Cursor can be added later if a stable and permission-safe history source is available.

### Raw-history usability feedback

A commenter asked about using the raw session history directly; the creator's response emphasized that raw files are large JSON and the value is making them navigable.

Engineering consequence: drill-down and search matter, but they should coexist with metadata-only privacy defaults.

No attributable commenter-linked child product was found in the captured evidence.

## Dedupe against existing Token Intelligence work

### Existing RE-231 / cost-xray

RE-231 focuses on live request/context/cost evidence:
- wire/request attribution
- reconciliation
- MCP overhead
- privacy receipt
- provider-neutral cost evidence

### Existing Token Intelligence collectors/receipts

The repo already has collector and run-receipt concepts. Recent RE-341 work for local/session metrics is intentionally isolated from `main` pending review as of the branch point used for this dossier.

RE-353 should therefore:
- not silently depend on unmerged RE-341 code;
- define its historical reconstruction contract against stable existing collector/telemetry concepts;
- later reconcile with RE-341 only after that slice is reviewed;
- avoid duplicating pricing, privacy, or run-receipt authorities.

## Independently authored Phase A

### 1. Contracts

Add versioned types such as:

```ts
type HistoricalCoverage = "complete" | "partial" | "failed";

interface HistoricalSourceReceipt {
  schemaVersion: "1";
  adapter: string;
  sourceRef: string;
  coverage: HistoricalCoverage;
  readOnly: true;
  networkUsed: false;
  contentRetention: "metadata_only" | "local_inspection";
  limitations: string[];
}

interface HistoricalTurn {
  turnRef: string;
  sourceRef: string;
  occurredAt: string | null;
  promptRef: string | null;
  fileRefs: string[];
  editRefs: string[];
  errorCount: number | null;
  usage: HistoricalUsage;
  models: HistoricalModelUsage[];
  commitEvidence: HistoricalCommitEvidence[];
  segmentHints: HistoricalSegmentHint[];
}

interface HistoricalBoundaryEvidence {
  algorithmVersion: string;
  configurationVersion: string;
  reasons: Array<"gap" | "compaction" | "files" | "topic" | "explicit">;
  measurements: Record<string, number | string | boolean | null>;
}

interface HistoricalTask {
  taskRef: string;
  turnRefs: string[];
  boundary: HistoricalBoundaryEvidence | null;
  coverage: HistoricalCoverage;
}

interface HistoricalSitting {
  sittingRef: string;
  taskRefs: string[];
  startedAt: string | null;
  endedAt: string | null;
  activeMinutes: number | null;
}
```

Names are illustrative; final types should follow repository conventions.

### 2. Fixture adapters

Start with original/synthetic fixtures for:
- Claude Code
- Codex CLI

Do not require real personal history in the test suite.

Pi and Cursor are later adapters.

### 3. Deterministic reconstruction

Implement a simple first algorithm that:
- uses explicit timestamps and source hints;
- stores every boundary reason;
- has versioned configuration;
- makes no model call;
- never claims semantic truth.

Thresholds should be derived from our fixture/acceptance needs rather than copied blindly from Bough.

### 4. Git enrichment

Add a read-only repository adapter with explicit unavailable/error states.

### 5. Economics

Map historical usage to the existing Token Intelligence cost/provenance model.

### 6. Privacy

Default durable output to metadata only.

## Focused tests

Required before any completion claim:

1. same history replay produces identical refs/boundaries;
2. duplicate source events do not double-count usage or cost;
3. out-of-order timestamps do not produce negative active time;
4. missing timestamps remain unknown;
5. corrupt/partial history yields partial/failed coverage;
6. unsupported format version fails explicitly;
7. Windows/POSIX path normalization preserves project isolation;
8. unrelated projects never merge because paths happen to resemble each other;
9. ambient/tool-owned files do not dominate links/churn;
10. input/output/cache-read/cache-write reconcile exactly;
11. model changes within a task remain separately attributable;
12. unknown price stays unknown;
13. partial pricing cannot produce a complete total;
14. missing/rebased/manual commits remain distinguishable;
15. Git reads cannot escape repository scope;
16. metadata-only mode stores no prompt/code/tool-output/source-path content;
17. network calls are blocked in the Phase A ingestion test;
18. source history remains byte-identical after ingestion;
19. segmentation evidence survives serialization round-trip;
20. algorithm/config version changes produce explicit reconstruction-version changes.

## Phase B+

Only after Phase A is exact-head certified:

- Pi adapter.
- Cursor adapter if a stable/public-safe source is established.
- local prompt search with ephemeral content access.
- sitting/task timeline UI.
- cross-sitting evidence graph.
- historical vs live run reconciliation.
- commit/outcome overlays.
- opt-in local semantic labels.
- user-controlled threshold tuning and before/after comparison.

## Explicit non-claims

Until independently evidenced, do not claim:

- Bough parity.
- universal task-segmentation accuracy.
- accurate intent inference.
- provider billing equivalence.
- Cursor support.
- production readiness.
- deployment readiness.
- commercial readiness.
- savings.
- productivity improvement.
- psychological "struggle" measurement.

## Source ledger

1. Supplied Reddit launch: https://www.reddit.com/r/vibecoding/comments/1wu2o6j/need_feedback_would_you_guys_find_this_tool_useful/
2. Bough repository: https://github.com/nickelsec/bough
3. Bough site/docs: https://www.bough.run/
4. Upstream tuning notes: https://github.com/nickelsec/bough/blob/main/docs/tuning.md
5. Claude Code format notes: https://github.com/nickelsec/bough/blob/main/docs/format-claude-code.md
6. Codex format notes: https://github.com/nickelsec/bough/blob/main/docs/format-codex.md
7. Pi format notes: https://github.com/nickelsec/bough/blob/main/docs/format-pi.md
8. Owned scope: https://github.com/rrahul0904/token-calculator/issues/50

## Current owned state

At this dossier's branch point:
- Token Intelligence `main`: `a4b38739b148bb033ddfa87dea40601cc442d9e6`
- RE-353 native implementation: **not started**
- RE-353 exact-head CI: **not applicable yet; documentation-only**
- tracker: RE-353 registered
- issue: #50 open

The next repository action is the smallest Phase A contract/fixture slice above, on a new implementation branch after this dossier is reviewed and without depending on unmerged RE-341 work.
