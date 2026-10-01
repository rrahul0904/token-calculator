# cost-xray → Token Intelligence: Clean-room Reverse-Engineering Dossier

**Tracker target:** Token Intelligence / `rrahul0904/token-calculator`  
**Source product:** cost-xray  
**Reddit discovery:** https://www.reddit.com/r/coolgithubprojects/s/JvOHHU40xC  
**Public upstream:** https://github.com/tigerless-labs/cost-xray  
**Upstream reference commit observed during research:** `5d69deb210fcd8e045cc6b3118f170855bcdae50`  
**Research date:** 2026-09-24  
**Owned issue:** #43  
**Owned branch:** `reverse/cost-xray-wire-attribution`

## 1. Decision

Treat cost-xray as a **capability donor**, not a standalone owned product.

Its core value is request-time observability for coding agents: it inspects the model-provider wire payload rather than relying only on post-run transcripts. That capability fits the existing Token Intelligence roadmap for agent economics, telemetry, budgets, verified savings, and governance.

The owned implementation must remain Token Intelligence-native:
- reuse existing product identity and telemetry concepts;
- implement independently in our own TypeScript/Next.js/collector architecture;
- do not copy upstream Python source, UI, wording, screenshots, installer scripts, or branding;
- treat the upstream MIT license as provenance, not as permission to collapse our clean-room boundary.

## 2. What the donor actually does

Public upstream documentation and repository structure show these observable capabilities:

1. **Local request capture**
   - Claude Code: reverse proxy through a configurable base URL.
   - Codex: forward proxy because its endpoint is fixed; a locally scoped CA is trusted by the wrapped process only.
   - Capture is intended to be transparent to the coding-agent workflow.

2. **Request-time context decomposition**
   - system/instruction blocks;
   - tool schemas;
   - MCP server/tool schemas;
   - user and assistant messages;
   - tool calls and tool results;
   - reasoning/thinking;
   - output;
   - provider-specific opaque/compaction markers.

3. **Token and dollar attribution**
   - fresh input;
   - cache-read input;
   - cache-write input where applicable;
   - output;
   - reasoning/thinking;
   - attribution down to individual sources/tools/calls.

4. **Context-window occupancy**
   - reports which categories occupy the working window regardless of whether they are cheap due to prompt caching;
   - exposes static schema/context bloat separately from marginal spend.

5. **Waste signals**
   - MCP servers injected but never used;
   - tool schemas whose repeated prefix cost outweighs actual usage;
   - large tool-result payloads;
   - repeated cache writes / prefix churn;
   - reasoning-heavy turns.

6. **Local evidence store**
   - append-only raw records;
   - repeated content blocks deduplicated;
   - derived events and summaries generated after capture;
   - raw data remains the source of truth and can be re-materialized when analysis logic changes.

7. **Drill-down UX**
   - agent → project → session → category → MCP server → tool → call;
   - cost and token splits;
   - source-content retrieval on demand.

8. **Verification**
   - reconciles attributed totals back to provider-reported usage;
   - uses conservation-style invariants rather than brittle fixed token expectations.

## 3. Architectural pattern worth adopting

The donor has a clear three-stage separation:

```text
coding agent
    |
    v
[ capture + redact ]
    |
    v
[ append-only evidence ]
    |
    v
[ materialize / classify / reconcile / price ]
    |
    v
[ receipts + API + UI + detectors ]
```

For Token Intelligence, preserve that separation even if the implementation language and storage differ.

### Stage A — Collector / capture

Responsibilities:
- observe only explicitly opted-in local agent traffic;
- identify provider, agent, model, project, run/session and turn;
- redact credentials and secret-looking fields before persistence;
- persist evidence quickly;
- never perform expensive tokenization, pricing, ML analysis, or UI aggregation in the request hot path;
- fail open to the original agent/provider path if capture is unavailable, unless the user explicitly enables a fail-closed compliance mode later.

### Stage B — Materializer

Responsibilities:
- normalize provider-specific traffic into a canonical receipt/event model;
- identify static prefix, message, tool schema, tool call/result, reasoning and output spans;
- calculate or estimate per-span token size;
- reconcile span totals to provider usage;
- attach cache state, pricing version, confidence and provenance;
- generate incremental rollups;
- re-run historical analysis when rules/pricing versions change.

### Stage C — Product surfaces

Responsibilities:
- run/session explorer;
- context occupancy;
- cost waterfall;
- MCP/tool overhead;
- anomaly/waste findings;
- budgets/policy;
- verified-savings comparison;
- exports/OpenTelemetry/API.

## 4. Provider asymmetries we must model explicitly

### Claude Code / Anthropic Messages-style traffic

Observed characteristics:
- reverse-proxy capture can use a base-URL override;
- a completed request/response can be treated as a mostly self-contained turn because conversation context is re-sent;
- system content and tool schemas are visible in the request;
- cache-read and cache-creation/write usage must be represented separately;
- reasoning/thinking blocks need special treatment because raw wire shape may not map directly to visible plaintext;
- exact per-source tokenization may require provider token-count support, while total billing usage is provider reported.

Owned implication:
- our receipt model must support **exact total + estimated internal split**;
- every span needs `measurementMode` and `confidence`;
- the UI must never imply exact per-span truth when we only have calibrated attribution.

### Codex / OpenAI Responses-style traffic

Observed characteristics:
- forward-proxy capture is needed when the endpoint is not configurable;
- traffic may arrive as WebSocket frames rather than one complete record per turn;
- reasoning-token totals can be reported even if reasoning content is not readable;
- server-side history means each request may carry only new items;
- compaction/history reset events can make prior context opaque.

Owned implication:
- collectors must support both request/response and frame-stream transports;
- canonical turns may be assembled from multiple transport events;
- context lineage needs explicit `historyMode`, `compactionBoundary`, and `visibility` fields;
- do not fabricate attribution for opaque server-side history.

## 5. Canonical owned data contract

Phase A should add a provider-neutral wire-attribution extension compatible with existing run telemetry.

### Run

```ts
type AgentRun = {
  runId: string;
  projectId?: string;
  repository?: string;
  agent: "codex" | "claude-code" | "cursor" | "gemini-cli" | "other";
  provider: string;
  model: string;
  startedAt: string;
  endedAt?: string;
  captureMode: "transcript" | "wire-reverse-proxy" | "wire-forward-proxy" | "gateway";
  retentionMode: "metadata-only" | "redacted-content" | "full-local-content";
  localOnly: boolean;
};
```

### Turn receipt

```ts
type TurnAttributionReceipt = {
  receiptVersion: string;
  runId: string;
  turnId: string;
  sequence: number;
  providerUsage: ProviderUsage;
  contextWindow?: ContextWindowState;
  spans: AttributionSpan[];
  reconciliation: ReconciliationResult;
  privacy: PrivacyReceipt;
  pricingVersion: string;
  createdAt: string;
};
```

### Attribution span

```ts
type AttributionSpan = {
  spanId: string;
  parentSpanId?: string;
  sourceType:
    | "system"
    | "developer"
    | "user"
    | "assistant"
    | "mcp-schema"
    | "tool-schema"
    | "tool-call"
    | "tool-result"
    | "reasoning"
    | "output"
    | "compaction"
    | "provider-overhead"
    | "unknown";
  sourceName?: string;
  mcpServer?: string;
  toolName?: string;
  inputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  contextTokens?: number;
  costUsd?: number;
  measurementMode: "provider-measured" | "tokenizer-exact" | "calibrated" | "estimated" | "opaque";
  confidence: "high" | "medium" | "low";
  evidenceRef?: string;
};
```

### Reconciliation

```ts
type ReconciliationResult = {
  providerInputTokens?: number;
  attributedInputTokens?: number;
  providerOutputTokens?: number;
  attributedOutputTokens?: number;
  deltaInputTokens?: number;
  deltaOutputTokens?: number;
  withinTolerance: boolean;
  toleranceReason?: string;
};
```

### Privacy receipt

```ts
type PrivacyReceipt = {
  listenerScope: "loopback" | "gateway";
  secretsRedactedBeforePersistence: boolean;
  systemTrustStoreModified: boolean;
  localCaMode?: "none" | "process-scoped";
  rawContentPersisted: boolean;
  retentionMode: "metadata-only" | "redacted-content" | "full-local-content";
};
```

## 6. MCP overhead model

This is the highest-value immediate donor feature.

For every turn:
1. enumerate MCP servers and tools whose schemas are present in the request;
2. calculate their context occupancy;
3. calculate incremental billable input where observable;
4. record whether each server/tool was actually invoked in the turn and session;
5. aggregate repeated schema occupancy across the session;
6. mark findings only when evidence crosses a configurable threshold.

Suggested finding schema:

```ts
type McpOverheadFinding = {
  runId: string;
  mcpServer: string;
  toolName?: string;
  injectedTurns: number;
  invokedTurns: number;
  contextTokens: number;
  estimatedCostUsd: number;
  finding: "unused-server" | "unused-tool" | "oversized-schema" | "schema-churn";
  confidence: "high" | "medium" | "low";
  evidenceSpanIds: string[];
  recommendation?: string;
};
```

Do not call something "waste" solely because it is large. A large stable prefix may be cheap due to cache reads and still consume context window. Preserve separate metrics:
- **window occupancy**
- **fresh billable input**
- **cache-read cost**
- **cache-write cost**
- **actual invocation utility**

## 7. Capture security contract

The local collector is trust-sensitive. These are mandatory product requirements:

- bind to loopback only by default;
- redact `Authorization`, `x-api-key`, cookies, bearer tokens and configured secret-field patterns before persistence;
- never install a CA into the operating-system trust store;
- any CA must be process-scoped and explicitly consented to;
- provide a bypass/disable path that restores direct agent execution;
- a collector crash must not silently trap or corrupt agent traffic;
- raw-content retention must be explicit, visible and configurable;
- metadata-only must remain a supported mode;
- never upload captured prompt/code content to the hosted Token Intelligence service unless the user explicitly enables a separate sync mode;
- provenance and retention policy must be attached to every receipt.

## 8. Storage design for Token Intelligence

Keep local collection and hosted aggregation separable.

### Local store

Recommended logical tables/files:
- `runs`
- `transport_events`
- `content_blocks`
- `turns`
- `attribution_spans`
- `reconciliation_receipts`
- `findings`
- `pricing_snapshots`

Properties:
- append-first;
- content-addressed block deduplication;
- immutable raw evidence where retained;
- derived views rebuildable from raw evidence;
- versioned materializer logic;
- idempotent event ingestion.

### Hosted service

Default upload:
- run metadata;
- normalized usage buckets;
- attributed metrics;
- findings;
- confidence/reconciliation;
- no raw prompt/code content.

Optional future enterprise mode may support customer-controlled encrypted content retention, but that is outside this first slice.

## 9. UI map

Integrate into Token Intelligence rather than cloning the donor TUI.

### Run overview
- agent / project / repository / model;
- total cost and tokens;
- fresh vs cache-read vs cache-write vs output;
- reasoning;
- outcome/verification status;
- anomalies.

### Context X-ray
- stacked context occupancy by source category;
- static prefix vs dynamic history;
- MCP/tool schema occupancy;
- compaction/opaque-history markers;
- current window percentage and headroom.

### Cost waterfall
- turn sequence;
- per-turn fresh/cache/output/reasoning split;
- retries/fallbacks;
- cache churn.

### MCP efficiency
- server → tool;
- injected turns;
- invoked turns;
- context occupancy;
- attributable spend;
- evidence/confidence;
- enable/disable recommendation as advisory only.

### Evidence
- receipt IDs;
- provenance;
- measurement mode;
- reconciliation deltas;
- pricing version;
- content visibility.

## 10. Phase A implementation scope

**Goal:** land the canonical attribution contract and deterministic analysis without live interception.

Deliverables:
1. TypeScript domain types / Zod schemas.
2. Provider-neutral normalization helpers.
3. deterministic fixtures representing:
   - Claude-like self-contained turn with cache read/write;
   - Codex-like frame-assembled turn with server-side history;
   - MCP schemas + one used and one unused tool;
   - opaque compaction span.
4. reconciliation function.
5. MCP overhead analyzer.
6. privacy receipt validation.
7. API-safe serialization contract.
8. unit tests for invariants.

Acceptance tests:
- attributed totals reconcile to provider usage within configured tolerance;
- cache buckets never double-count input;
- reasoning is not counted twice as normal output;
- unused MCP findings require schema presence + zero invocation evidence;
- opaque history remains opaque;
- secret-like fixture values never appear in persisted normalized snapshots;
- no existing pricing/calculator behavior regresses.

## 11. Phase B — local collectors

### Codex first
Reason:
- matches existing Token Intelligence priority;
- exact/near-exact OpenAI tokenizer support is available;
- wire usage provides strong reconciliation anchors.

Work:
- explicit install/enable command;
- loopback forward proxy;
- process-scoped CA only;
- WebSocket frame capture;
- redaction;
- transport event log;
- turn assembler;
- local status/stop/bypass commands.

### Claude Code second
Work:
- base-URL reverse-proxy mode;
- no CA;
- HTTP/SSE turn capture;
- cache-read/cache-write classification;
- optional provider token-count enrichment when credentials are already locally available and user opts in.

## 12. Phase C — product integration

- local collector exports normalized receipts to the Token Intelligence web UI;
- offline import first;
- optional authenticated sync later;
- run/session explorer;
- context X-ray;
- MCP efficiency;
- anomaly findings;
- verified savings before/after comparison.

## 13. Phase D — policy / control plane

Connect observed economics to existing Token Intelligence controls:
- run budget;
- max context occupancy;
- allowed agent/model;
- fallback-premium approval;
- max retry/tool-call thresholds;
- advisory MCP disable suggestions;
- gateway enforcement only where Token Intelligence is actually in the provider request path.

Do not claim hard enforcement for local observe-only collectors.

## 14. Verification strategy

### Repository certification
- typecheck;
- unit/integration tests;
- production build;
- schema compatibility tests;
- privacy/redaction fixtures;
- reconciliation invariants.

### Local collector certification
- loopback-only binding proof;
- bypass proof;
- crash/fail-open proof;
- process-scoped CA proof where relevant;
- no OS trust-store mutation;
- live Codex/Claude fixture capture only after explicit test credentials/environment are available.

### Hosted certification
Separate from local collector certification:
- exact deployed commit;
- authenticated import/sync behavior;
- data retention policy;
- browser evidence for run explorer/context X-ray;
- no claim that a hosted web deployment proves local proxy behavior.

## 15. Known risks

- provider wire formats can change;
- agent wrappers may alter proxy/environment behavior;
- encrypted reasoning/content limits exact source decomposition;
- server-side conversation history and compaction can make old context opaque;
- pricing and cache semantics change by model/provider;
- MIT upstream availability can tempt direct copying—avoid it to preserve a consistent independent implementation lineage;
- raw-content retention creates a materially higher privacy/security burden than metadata-only telemetry.

## 16. Smallest truthful next implementation action

Implement **Phase A only** on this branch:
- canonical wire-attribution receipt;
- reconciliation;
- MCP schema/invocation overhead analyzer;
- privacy receipt;
- deterministic fixtures/tests.

Do **not** claim live interception, local-proxy certification, Codex/Claude compatibility, or hosted readiness until those phases have independent evidence.
