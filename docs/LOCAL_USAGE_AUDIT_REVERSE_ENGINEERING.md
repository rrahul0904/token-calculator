# Local AI usage audit — reverse-engineering notes

## Public behavior reviewed

Source product: **optimaizr**, described publicly in a Reddit post in `r/startupaccelerator` (September 2026).

The public product description presents a local CLI that scans AI-agent usage and turns it into cost/usage recommendations. The behaviors described publicly include:

- scan local AI usage;
- identify over-specified model usage;
- identify unnecessary context / token growth;
- identify redundant calls;
- identify heavy reasoning usage that may merit a cheaper configuration;
- present usage drill-downs and recommendations;
- generate an audit/report without sending the underlying usage data away from the machine.

This implementation is a clean-room capability mapping from those public behaviors. No proprietary source code, private implementation detail, naming, thresholds, or report text from optimaizr is copied.

## Why this belongs in Token Intelligence

Token Intelligence already had the harder primitives before this slice:

- local Codex, Claude, Cursor, and Antigravity collectors;
- normalized telemetry that strips prompt/code/transcript contents at the collector boundary;
- run/turn/LLM/tool-call token and cost receipts;
- findings for repeated resource reads, oversized tool output, retry loops, same-resource edit churn, excessive context growth, cache blind spots, fallback premiums, and spend without verified outcomes;
- evidence-gated model-rightsizing logic that only recommends a cheaper route when comparable successful-run or experiment evidence exists.

The missing product surface was a local-first audit that composes those primitives into one report before upload.

## Implemented slice

### CLI

```bash
npm run ti -- audit codex /path/to/session.jsonl
npm run ti -- audit claude /path/to/session.jsonl --since 7d
npm run ti -- audit antigravity /path/to/session.jsonl --json
```

`audit` parses the provider trace locally, runs the Token Intelligence findings engine, adds a conservative reasoning-effort benchmark signal, and prints either a human report or JSON.

The command does not require a Token Intelligence API key and does not invoke the ingestion API.

### Privacy boundary

The audit consumes the existing normalized collector output. It does not inspect or persist prompt text, source code, transcript content, or raw tool output. Report metadata explicitly records:

- `localOnly: true`
- `contentStored: false`
- `rawPromptContentInspected: false`
- `networkRequestsRequired: false`

### Recommendation mapping

| Public behavior | Token Intelligence implementation |
| --- | --- |
| unnecessary context | orientation-heavy, oversized-tool-output, excessive-context-growth |
| redundant calls | repeated-resource-read, tool-retry-loop, same-resource-edit-churn |
| cache waste | cache-blind-spot |
| expensive fallback behavior | fallback-premium |
| over-specified model | oversized-model-route, only with comparable successful-run / experiment evidence |
| heavy reasoning | reasoning-review-candidate; benchmark signal only, never a claim that the private task was simple |
| local report | `ti audit ...` human output or `--json` |

## Truthfulness constraints

The implementation intentionally does **not** reproduce two tempting but weak claims:

1. **No generic model-downsizing claim.** A model being expensive is not evidence that it was over-specified. Token Intelligence keeps its existing requirement for comparable successful-run or experiment evidence before recommending a lower-cost route.
2. **No additive headline savings total.** Context, retries, tool output, and fallback findings may overlap. The audit reports the largest individually supported token and dollar opportunities and explicitly marks `additiveSavingsClaimed: false` instead of summing overlapping estimates.

Similarly, high reasoning token usage is only surfaced as a benchmark candidate. The audit does not inspect private prompt contents and therefore does not infer that a task was "simple."

## Certification target for this slice

Repository certification should establish:

- TypeScript typecheck passes;
- unit tests pass, including local audit privacy and non-additive-savings behavior;
- production build passes;
- the CLI help includes the new `audit` command;
- a real local provider trace can be audited without an API key and without a network call.

The first three gates can be repository-certified in CI. The final real-trace CLI execution remains runtime evidence and should not be claimed until it is actually exercised against an available local trace.

## Follow-on parity work

Useful later increments, kept out of this first isolated slice:

- directory/history scanning across many session files rather than one trace at a time;
- time-window rollups (daily/weekly/monthly);
- versioned local report files and before/after trend comparison;
- locally derived model-routing cohorts wired into the existing evidence-gated route optimizer;
- web UI presentation of imported audit reports;
- measured provider pricing projection when sufficient cost receipts are available.
