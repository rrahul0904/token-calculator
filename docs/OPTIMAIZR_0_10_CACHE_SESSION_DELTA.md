# Optimaizr 0.10 cache/session delta — clean-room reverse-engineering dossier

Date: 2026-10-08  
Tracker: #64  
Implementation branch: `feat/optimaizr-cache-session-economics`

## 1. Scope and clean-room boundary

This is a delta to the earlier Token Intelligence Optimaizr/local-usage track, not a new product and not a UI clone. The donor is used to recover user intent, observable behavior, failure modes, and useful contracts. Token Intelligence keeps its own normalized telemetry schema, product language, policy semantics, and implementation.

Primary references:

- Reddit launch/update: https://www.reddit.com/r/SideProject/comments/1x0w9yl/i_found_56_of_my_claude_usage_was_rereading_my/
- Donor public source: https://github.com/blendbunjaku/optimaizr
- Donor product site: https://optimaizr.com/
- Anthropic prompt-caching docs: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Anthropic pricing docs: https://platform.claude.com/docs/en/about-claude/pricing

Existing internal donor/work to reuse:

- `docs/LOCAL_USAGE_AUDIT_REVERSE_ENGINEERING.md`
- `src/lib/optimization/local-usage-audit.ts`
- `src/lib/optimization/local-usage-scan.ts`
- collector registry and normalized telemetry events
- cost provenance and overlap-safe savings semantics
- privacy contract: local normalized metadata, no prompt/code persistence
- quota/runtime-budget work tracked separately

## 2. Evidence ledger

| Observation | Evidence class | Confidence | Date observed | Clean-room implication |
|---|---|---:|---|---|
| Current donor warns before a material cache expiry rather than only reporting a cold return later. | developer-stated + official-source | high | 2026-10-08 | Add prospective cache-risk evaluation. |
| Current Reddit behavior uses a five-minute warning lead. | developer-stated | high | 2026-10-08 | Warning lead is configurable product policy, not a universal provider constant. |
| Reddit discussion describes suppressing alerts below a token/cost threshold and warning once per idle stretch. | developer-stated + user feedback | medium-high | 2026-10-08 | Add a quiet gate and stable alert identity. |
| Recent donor changelog distinguishes cache-population timing from session-start timing and accounts for handoffs. | official-source | high | 2026-10-08 | Cache anchor must come from cache evidence, never `sessionStart + TTL` by assumption. |
| Donor exposes live per-turn economics, cache timing, context, and session runway. | developer-stated + official-source | high | 2026-10-08 | Produce a normalized report suitable for CLI/statusline/live surfaces. |
| Anthropic currently documents default 5-minute and optional 1-hour prompt-cache TTLs. | official-doc | high | 2026-10-08 | Preserve explicit TTL classes in the Claude collector. |
| Anthropic documents that cache lifetime refreshes when cached content is used. | official-doc | high | 2026-10-08 | A cache-read event may refresh a previously known unambiguous TTL horizon. |
| Anthropic documents lifetime measurement from request start, not response end. | official-doc | high | 2026-10-08 | Use normalized turn/request start as the anchor when available. |
| Cache-read usage does not identify which TTL bucket was read when 5m and 1h entries coexist. | inferred from official response schema | high | 2026-10-08 | Refuse to collapse mixed TTLs into a single deadline. |
| API-equivalent token cost can differ from a subscription user's actual bill. | competitor docs + existing internal contract | high | 2026-10-08 | Cost signals must preserve provenance and never be presented as an invoice without a receipt. |

## 3. User workflow reconstruction

### Retrospective-only workflow (existing)

1. Discover local provider histories.
2. Normalize token/cache/cost metadata.
3. Aggregate sessions and findings.
4. Show where usage was expensive or inefficient after it happened.

### Prospective cache-risk workflow (new delta)

1. Parse normalized local events.
2. Locate cache interaction evidence.
3. Determine whether a single TTL class is defensible.
4. Anchor the horizon at request/turn start.
5. Refresh that horizon on a later cache read only when the prior TTL class is unambiguous.
6. Apply a materiality/noise gate.
7. Evaluate the injected clock against the expiry and warning lead.
8. Emit a bounded action class plus a stable alert key.
9. Never send a keepalive or mutate a provider session from the evaluator.

## 4. State machine

`unknown`
- Missing supported anchor or TTL.
- Cache-read evidence exists without a known TTL class.
- Latest normalized write mixes 5-minute and 1-hour TTL classes.
- Action: `unknown`.

`quiet`
- Horizon is known, but no observed materiality signal crosses the configured interruption threshold.
- Action: `continue`.

`healthy`
- Horizon is known and material, and expiry is outside the warning lead.
- Action: `continue`.

`warning`
- Horizon is known and material, and expiry is inside the warning lead but has not passed.
- Action: `prepare_handoff`.

`expired`
- Horizon is known and material, and the evidence-backed horizon has passed.
- Action: `handoff_now`.

The state machine is pure and deterministic for the same normalized facts, policy, and injected `now`.

## 5. Noise-budget contract

The donor feedback is useful because the value is not merely the timer; it is the decision to stay quiet when interruption costs more than the likely token waste.

Token Intelligence therefore separates:

- provider facts: anchor timestamp, TTL class, normalized token/cost observations;
- product policy: warning lead, minimum context threshold, minimum cost threshold;
- user action: continue, prepare a handoff, or hand off now.

The Oct 8 Reddit post discussed 50,000 tokens and $0.50 as a noise budget. Those values are captured as configurable defaults for this first implementation wave, not encoded as provider truth.

## 6. Cache anchor reconstruction

For normalized Claude events, the collector already preserves:

- `cacheReadTokens`
- aggregate `cacheWriteTokens`
- `metadata.cacheWrite5mTokens`
- `metadata.cacheWrite1hTokens`
- turn identity and turn start

Rules:

1. A 5-minute-only write establishes a 300-second TTL class.
2. A 1-hour-only write establishes a 3,600-second TTL class.
3. A subsequent cache read refreshes the most recently known unambiguous TTL class, because Anthropic documents refresh-on-use.
4. Anchor at the associated normalized turn/request start when available.
5. If a write contains both TTL classes, set the horizon to unknown rather than pretending the session has one expiry.
6. A cache read with no previously established TTL class remains unknown.

This is intentionally more conservative than an implementation that assumes all Claude Code cache traffic is one hour.

## 7. Competitive comparison

### ccusage

Strengths:
- mature local accounting;
- multiple cost calculation modes;
- multi-agent usage reporting.

Lesson for Token Intelligence:
- preserve cost provenance and prefer measured/provider values when available.

### claude-usage-monitor

Strengths:
- local dashboard;
- session history and subscription caveats;
- clear API-equivalent cost labeling.

Lesson:
- separate optimization economics from actual subscription billing.

### ClaudeCodeUsage

Strengths:
- local Claude/Codex visibility;
- cache/quota insights;
- attention to duplicate usage records.

Lesson:
- accounting integrity is a prerequisite for live recommendations.

### claude-code-monitor

Strengths:
- incremental local transcript parsing;
- deduplication;
- billing-mode caveats and cache accounting.

Lesson:
- live UI is downstream of a trustworthy normalization layer; do not couple inference to presentation.

## 8. Failure-mode decomposition

### False precise timer
Risk: showing a confident countdown from session start when the cache was populated later or refreshed.
Mitigation: explicit evidence-backed anchor contract.

### Mixed TTL collapse
Risk: combining 5m and 1h cache entries into one deadline.
Mitigation: `mixed_ttl_write -> unknown`.

### Response-end anchor
Risk: starting TTL from response completion overstates remaining time for long generations.
Mitigation: prefer associated turn/request start.

### Alert spam
Risk: repeated warning every polling interval.
Mitigation: stable `alertKey` from session + cache anchor + TTL; caller persists/suppresses as needed.

### Fake cost certainty
Risk: showing API-equivalent dollars as the user's real subscription spend.
Mitigation: explicit cost basis; unknown stays unknown.

### Provider mutation
Risk: optimizer sends a keepalive merely to preserve cache, creating unwanted calls/costs.
Mitigation: evaluator is advisory only; no provider writes.

### Privacy regression
Risk: live workflow starts persisting prompt/tool payloads.
Mitigation: engine accepts normalized metadata only; CLI output excludes local path and transcript content.

## 9. Implemented contracts in this branch

### `src/lib/optimization/session-cache-risk.ts`

- pure deterministic evaluator;
- explicit `unknown / quiet / healthy / warning / expired` states;
- bounded action vocabulary;
- configurable warning and noise thresholds;
- stable alert identity;
- cache TTL reconstruction from normalized Claude cache-write metadata;
- read-refresh behavior when TTL is unambiguous;
- mixed-TTL refusal;
- privacy-safe human report formatter.

### `scripts/cache-risk.ts`

Offline execution surface:

```bash
npx tsx scripts/cache-risk.ts claude ~/.claude/projects/.../session.jsonl --json
```

Deterministic test/debug mode:

```bash
npx tsx scripts/cache-risk.ts claude session.jsonl \
  --now 2026-10-08T12:56:00Z \
  --warning-minutes 5 \
  --min-context 50000 \
  --min-cost none \
  --json
```

The command performs no network request and does not require a Token Intelligence API key.

## 10. Verification matrix

| Contract | Test |
|---|---|
| Missing anchor/TTL stays unknown | `session-cache-risk.test.ts` |
| Below materiality thresholds stays quiet | `session-cache-risk.test.ts` |
| Healthy/warning/expired boundaries deterministic | `session-cache-risk.test.ts` |
| Token OR cost signal may activate warning | `session-cache-risk.test.ts` |
| Alert identity stable within one cache stretch | `session-cache-risk.test.ts` |
| Refreshed anchor produces a new alert identity | `session-cache-risk.test.ts` |
| Mixed TTL writes are refused | `session-cache-risk.test.ts` |
| Claude 1h write uses turn start as anchor | `session-cache-risk.test.ts` |
| Later cache read refreshes known 1h horizon | `session-cache-risk.test.ts` |
| Cache read without supported TTL stays unknown | `session-cache-risk.test.ts` |
| Real CLI reads a local history file and emits bounded JSON | `session-cache-risk-cli.test.ts` |
| CLI output excludes transcript content and source path | `session-cache-risk-cli.test.ts` |

## 11. Architecture boundary

This wave deliberately stops at a trustworthy decision primitive. It does not yet merge cache risk into the existing generic `scan` report because historical scans and live session decisions have different clocks and semantics.

The next integration should be a live-tail adapter that:

1. tails the repository-certified local source;
2. reuses normalized collector events;
3. evaluates cache risk after each new usage-bearing turn;
4. deduplicates `alertKey` receipts durably;
5. emits a statusline/API event without provider mutation;
6. coordinates with the separate quota-window/runtime-budget subsystem rather than duplicating it.

## 12. Follow-on phases

### Phase B — live tail + receipts
- durable warning receipt keyed by `alertKey`;
- once-per-cache-stretch notification contract;
- restart reconciliation;
- no duplicate warning after process restart.

### Phase C — handoff receipt
- local summary/handoff artifact contract;
- source session + target session linkage;
- no automatic provider send;
- exact evidence that a handoff occurred before claiming avoided cold-return cost.

### Phase D — cache economics
- estimate cold reread vs warm read using versioned pricing provenance;
- separate 5m-write, 1h-write, and cache-read economics;
- label API-equivalent estimates distinctly from billed/provider receipts;
- never add overlapping opportunity estimates into a headline savings number.

### Phase E — status surfaces
- CLI live mode;
- statusline adapter;
- dashboard/API representation;
- user-configurable interruption/noise policy.

## 13. Exit criteria for this implementation wave

- [x] Evidence and feedback captured in tracker.
- [x] Internal donor overlap audited.
- [x] Product boundary and non-goals defined.
- [x] Deterministic cache-risk contract implemented.
- [x] Local executable surface implemented.
- [x] Unit/collector/CLI tests authored.
- [ ] CI passes on exact branch SHA.
- [ ] Independent diff review finds no raw-content leakage or unsupported provider assumptions.
- [ ] PR merged only after evidence-backed verification.
