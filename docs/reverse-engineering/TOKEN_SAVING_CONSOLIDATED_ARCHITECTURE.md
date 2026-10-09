# Token-saving portfolio: consolidated architecture

## Product boundary

Token Intelligence does not copy or bundle the 50 donor projects discovered through the Reddit landscape review. It reconstructs the useful product behaviors behind them as clean-room, provider-neutral capability families with independent evidence gates.

The invariant is:

> every enrolled donor maps to an owned Token Intelligence evaluator, while donor-specific source ambiguity or marketing claims never become product evidence.

`buildCapabilityCoverageReport()` enforces that invariant mechanically.

## 50 donors -> 11 owned capability families

| Donor technique | Native evaluator | Claim boundary |
| --- | --- | --- |
| output reduction | `output_reduction` | token reduction only after full-session measured evidence and signal preservation |
| context compression / virtualization | `context_compression` | token reduction only after full-session evidence, recovery overhead and evidence preservation |
| structured encoding | `structured_encoding` | token reduction only after fidelity and full-session gates |
| prompt-cache optimization | `prompt_cache_economics` | cost only; cache accounting never becomes a raw-token claim |
| repository retrieval / symbol / graph / index | `repository_context` | token reduction only with fresh retrieval, evidence preservation and measured sessions |
| persistent memory | `persistent_memory` | token reduction only with freshness, provenance and tenant isolation |
| behavior minimalism | `response_density` | token reduction only when shorter responses do not create clarification/retry regressions |
| semantic/exact cache | `semantic_cache` | token reduction only with freshness, isolation and false-hit controls |
| model routing | `routing_economics` | cost only; cheaper routes never imply fewer tokens |
| budget control | `budget_control` | cost only; enforcement, bypass and required-work gates are mandatory |
| agent orchestration | `orchestration_efficiency` | token reduction only after coordinator/handoff/retry/fallback overhead is charged |

Combined plans are evaluated separately by `optimizer_plan`; component percentages are never added.

## Rebuild / redesign decisions

### One control plane, not 50 clones

The donor landscape contains repeated implementations of the same underlying ideas. Token Intelligence consolidates those ideas into stable contracts instead of inheriting donor-specific CLIs, branding, prompts, hooks, provider assumptions or UI behavior.

### Evidence is authoritative

A capability is not "saving tokens" because a payload got shorter or an upstream README reports a percentage. A verified claim requires the evaluator's applicable gates: measured same-cohort evidence, minimum samples, outcome equivalence, authoritative provider/gateway receipts, provenance, isolation/freshness, and all candidate overhead.

### Cost and token claims stay separate

Prompt-cache economics, model routing and budget enforcement may lower spend while logical token usage stays flat or rises. Their evaluators therefore expose `costSavingsClaimable` and mechanically refuse token-savings claims.

### Multi-agent economics are full-session economics

Delegation can make a worker look efficient while the coordinator burns the savings. `orchestration_efficiency` charges coordinator, handoff, retry and fallback tokens and enforces a bounded fanout guardrail before a claim can pass.

## Runtime surfaces

The existing metadata-only portfolio analyzer remains the common in-process analysis facade. The MCP server additionally exposes dedicated surfaces for the three final capability families and for the coverage proof:

- `analyze_prompt_cache_economics`
- `analyze_budget_control`
- `analyze_orchestration_efficiency`
- `get_token_saving_capability_coverage`

Receipt-backed combined-plan analysis remains tenant/project scoped through stored run IDs so callers cannot manufacture authoritative economics.

## Clean-room and provenance boundary

The donor registry records identity status separately from capability coverage. A donor with `pending_verification` or `identity_ambiguous` can be classified into a capability family, but its donor-specific reverse-engineering lifecycle remains blocked until source identity is verified. No donor code, UI, branding, proprietary prompts or installer behavior is required by these implementations.

## Production certification

A complete family map is necessary but not sufficient for production readiness. Release certification still requires:

1. exact-head dependency install and vulnerability gates;
2. typecheck and portfolio contract tests;
3. repository-wide unit/integration/build/browser checks;
4. security checks;
5. hosted preview tied to the exact candidate SHA;
6. runtime health/configuration verification;
7. evidence-backed PR/tracker status with no unverified savings claims.
