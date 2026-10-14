# Token Harness reverse-engineering intake

Date: 2026-10-04  
Tracker: #56  
Implementation branch: `codex/token-harness-intelligence-20261004`  
Stacked base: PR #53 exact head `ccf0e1ad022fb69b20b63ac0f41c2332a7e8809e`

## Sources reviewed

- Reddit launch post: https://www.reddit.com/r/vibecoding/comments/1wxmk27/i_opensourced_token_harness_get_more_out_of_your/
- Public repository: https://github.com/giuliastro/token-harness
- Public README / lifecycle and CLI contracts.
- Public cross-post feedback, including the constraint that many developers use subscription allowances while workplace/API environments may restrict third-party harness installation.

This is a clean-room product analysis. Token Intelligence does not copy source code, UI, brand assets or private implementation details from the reference project.

## What the reference product is actually solving

The useful product idea is not another coding agent. It is a local control plane around existing coding agents that tries to reduce context/token waste and prove whether the optimization helped.

Observable capability groups:

1. **Output reduction** — shorten noisy shell/tool output while retaining failures, warnings and useful summaries.
2. **Lazy tool exposure** — avoid carrying a full MCP/tool schema catalog in context when only a subset is needed.
3. **Payload/context compaction** — reduce large tool payloads without silently treating a smaller payload as a quality win.
4. **Repository-aware context** — reduce repeated exploration by using code/repository relationship metadata.
5. **Routing** — delegate bounded work to cheaper models while keeping the primary model responsible for review.
6. **Lifecycle control** — discover, evaluate, recommend, preview, apply, verify, measure, monitor, update and roll back.
7. **Evidence discipline** — keep output reduction, subscription allowance and API-dollar savings separate; require paired/quality-checked evidence for strong claims.

## Why this belongs in Token Intelligence

Token Intelligence already owns adjacent primitives:

- local collectors for Codex, Claude, Cursor and Antigravity;
- Agent Run Receipt telemetry and metadata-only privacy boundaries;
- context/headroom math and tool-output findings;
- historical route comparison;
- MCP tools;
- verified-savings and outcome evidence.

The gap is the deterministic harness-efficiency policy layer that turns those measurements into controlled optimization decisions.

## Clean-room mapping

| Reference idea | Token Intelligence capability | Decision |
| --- | --- | --- |
| Output reducers | Tool-call output metadata + findings | Build generic evidence contract; do not bundle third-party reducers in slice 1 |
| Lazy MCP catalog | MCP server + context accounting | Model as `lazy_tool_catalog`; runtime tool discovery/visibility policy is a later slice |
| Context compressor | Context/headroom + tool-output metadata | Model as `context_compaction`; require quality verification |
| Repository map | Local collectors + repeated-read findings | Model as `repository_context`; evaluator never needs source content |
| Cheaper-model routing | Historical route optimizer / route lab | Reuse existing routing subsystem rather than build a second router |
| Savings dashboard | Verified savings + local audit | Feed verified component evidence into existing product surfaces in later slice |
| Install/apply/rollback | No equivalent safe optimizer lifecycle yet | Add only after preview/approval/ownership/rollback contracts exist |

## First slice implemented

### `src/lib/optimization/harness.ts`

A metadata-only evaluator accepts optimizer candidates with:

- optimizer kind;
- baseline tokens;
- delivered tokens;
- comparable sample count;
- evidence type;
- quality gate status;
- optional evidence source identifier.

A savings claim becomes `verified_savings` only when all of these are true:

1. evidence is `measured_before_after`;
2. baseline and delivered token counts are valid and show a reduction;
3. the configured minimum sample count is met;
4. the quality gate passed.

Historical observations and modeled estimates remain candidates. A quality regression or token regression is surfaced explicitly.

The report intentionally sets:

- `additiveSavingsClaimed: false`;
- `aggregateSavingsTokens: null`.

This prevents double-counting when two optimizers affect the same context/tool-output tokens.

### MCP `analyze_harness`

The MCP surface exposes the same evaluator to agents without a database round trip. The input is metadata-only; prompt content, source code and raw tool output are not required.

## Roadmap after slice 1

### Phase 2 — discovery adapters

- Derive candidate reducer evidence from existing `tool_call.recorded` metadata.
- Measure configured MCP schema/token exposure per agent/session.
- Add deterministic environment/component discovery receipts.
- Preserve local-only collection defaults.

### Phase 3 — benchmark and verification

- Version workload/benchmark IDs.
- Pair baseline and optimized runs.
- Require outcome non-inferiority before verified savings.
- Separate tool-output savings, context savings, subscription allowance effects and API-dollar economics.

### Phase 4 — previewed control lifecycle

- `discover -> evaluate -> recommend -> preview -> approve -> apply -> verify`.
- Record exact config diff and ownership before writes.
- Refuse unsupported versions instead of force-installing.
- Store a rollback receipt for every owned mutation.
- Never mutate unrelated user configuration.

### Phase 5 — product surface

- Harness Efficiency card in the local audit / app dashboard.
- Per-component evidence drill-down.
- Drift warnings when an agent/optimizer version changes or observed value deteriorates.
- Recommendation CTA only when the environment is compatible and the user explicitly approves the change.

### Phase 6 — routing integration

- Reuse the existing Token Intelligence route optimizer and route-lab evidence.
- Permit bounded cheaper-route recommendations only when outcome evidence satisfies the configured non-inferiority rule.
- Do not treat model-price differences alone as verified savings.

## Feedback incorporated

The launch discussion highlights an important adoption constraint: subscription users may value allowance extension, while API-heavy/company environments may prohibit arbitrary third-party harness installation. Token Intelligence therefore should **not** assume installation is the product. The durable value is measurement, policy, evidence and controlled integrations that can operate in restricted environments.

## Definition of done for this intake

Slice 1 is done only when:

- the clean-room mapping is tracked;
- the harness evidence engine has focused tests;
- MCP exposes the metadata-only analysis contract;
- the exact branch head passes hosted CI/typecheck/tests;
- no production deployment or universal savings claim is made from this work.
