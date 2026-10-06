# Token-saving portfolio — Wave 1 reverse-engineering dossier

Tracking issue: #60  
Branch: `codex/token-saving-portfolio-20261006`  
Base: PR #57 exact head `25f57a11e3ed56a3849646935311a17902f7ba0e` (CI and CodeQL green before this wave)

## Purpose

Token Intelligence is not cloning 50 unrelated projects. This program treats the Reddit-discovered tools as capability donors and benchmark hypotheses. Each donor must pass the same evidence-first roadmap before any owned capability is implemented or any savings claim is surfaced.

The product boundary remains the existing Token Intelligence control plane: canonical run/usage receipts, privacy-safe metadata, gateway/policy/budgets, experiments, verified-savings evidence, Cost-Xray attribution, Bough history reconstruction, harness optimization analysis, thin-root orchestration and graph-aware economics.

## Canonical source identities verified in Wave 1

| Donor | Canonical public source | Observed mechanism | Token Intelligence family | Status |
| --- | --- | --- | --- | --- |
| RTK / Rust Token Killer | `rtk-ai/rtk` | command-output filtering/compression before tool output reaches the agent | tool-output-reduction | source verified; upstream savings remain unverified by us |
| Context Mode | `mksglu/context-mode` | MCP sandbox keeps raw tool data outside active context; SQLite/FTS retrieval for continuity; terse output policy | tool-output-virtualization + context management | source verified; do not copy plugin/UI/hooks |
| llmtrim | `fkiene/llmtrim` | local proxy transforms request/tool/history payloads while protecting prompt-cache boundaries; includes tokenizer remeasurement and fallback behavior | request-context-compression | source verified; proxy/CA security model requires independent review |
| Headroom Desktop | `gglucass/headroom-desktop` | local desktop wrapper around compression pipeline for coding agents | request-context-compression | source verified; benchmark figures are upstream claims only |
| Ponytail | `DietrichGebert/ponytail` | behavioral minimalism / YAGNI-style agent instructions and plugin packaging | behavior-minimalism | source verified; evaluate against outcome quality, not LOC alone |
| claude-token-efficient | `drona23/claude-token-efficient` | instruction/rule profile aimed at reducing verbose agent behavior | behavior-minimalism | source verified; prompt-only controls are not an enforcement boundary |
| GrepAI | `yoanbernabeu/grepai` | local semantic repository search and call-graph context retrieval | repository-retrieval | source verified; indexing cost and retrieval quality must be included in full-session economics |

## Identity ambiguity discovered

`Distill` cannot yet be treated as one verified donor. Multiple public projects with that name implement materially different behavior, including session/skill mining and token-compression tooling. The portfolio registry deliberately marks it `identity_ambiguous`; evidence collection must not begin until the exact Reddit-linked implementation is resolved.

This is a required failure mode for the source-identification agent: a matching name is not sufficient provenance.

## Clean-room capability decomposition

### A. Tool-output reduction

Donors currently include RTK and the still-ambiguous Distill entry.

Owned Token Intelligence slice should be a provider-neutral **output-reduction receipt and experiment contract**, not an RTK-compatible CLI clone. It should record baseline tokens, delivered tokens, reducer identity/version, preserved error/warning signals, fallback/passthrough reason, latency overhead and linked task outcome. Any reducer implementation must be evaluated as a full session because smaller shell output can still increase total tokens when information loss causes retries.

### B. Tool-output virtualization / externalized context

Context Mode demonstrates a different pattern from simple string compression: keep bulky results outside the active context and retrieve bounded evidence when needed.

Token Intelligence should reuse existing run/evidence storage and repository-context primitives rather than introducing a parallel MCP memory database. The owned contract should focus on context occupancy, external evidence references, retrieval bytes/tokens, missed-context failures, compaction/recovery events and outcome linkage.

### C. Request/context compression

llmtrim and Headroom/Headroom Desktop demonstrate request-time compression layers. Relevant ideas include cache-prefix discipline, reversible/passthrough paths, stage-level attribution, tokenizer-aware measurement and explicit safety fallback.

Token Intelligence already has Cost-Xray wire attribution and a governed gateway. The clean-room target is therefore an optional **compression stage interface** behind the existing gateway/experiment/evidence boundaries, not another proxy product. No local CA or transparent interception should be added without a dedicated threat model and security review.

### D. Behavior minimalism

Ponytail and claude-token-efficient use behavioral instructions to reduce unnecessary code/output. This is useful as an experimentable policy profile, but instructions are not a mechanical enforcement boundary.

Evaluation must compare the same tasks, require equivalent or better acceptance outcomes, and record review/rework cost. Lines of code or output length may be diagnostics but cannot serve as the primary verified-savings denominator.

### E. Repository retrieval

GrepAI represents the semantic retrieval family. The useful owned primitive is budgeted repository context with explicit provenance, retrieval coverage, index/setup cost, latency, source privacy, and task outcome. Existing Jive graph telemetry and harness `repository_context` evaluation should be reused.

## Shared behavior contracts for implementation

1. Every optimization event has a stable reducer/retriever/profile identity and version.
2. Baseline and candidate use the same versioned workload/evaluation cohort.
3. Provider/model/token/cost evidence comes from authoritative Token Intelligence receipts, not worker self-report.
4. Raw prompt, source and tool output are not required by the portfolio evaluator.
5. Unknown economics remain unknown; they never become zero.
6. Cost-only model routing cannot be labeled token savings.
7. Component savings are not summed because techniques overlap.
8. A quality regression, retry explosion or unresolved failure blocks `verified_savings` even when payload size falls.
9. Indexing, compression, retrieval, local-model and orchestration overhead are included where they materially affect full-session economics.
10. Security-sensitive proxy/interception techniques require an independent threat-model review before implementation or hosting.

## Agent work graph

The portfolio planner assigns every donor the same bounded roles:

- **Supervisor** — owns ordering, capability-family consolidation, exact SHA/evidence and go/no-go decisions.
- **Source researcher** — resolves canonical post/repository/docs/license/snapshot and distinguishes forks/name collisions.
- **Feedback analyst** — captures Reddit comments, failure reports and contradictory user evidence.
- **Architecture reviewer** — maps donor behavior to existing Token Intelligence primitives; rejects duplicate subsystems.
- **Implementation worker** — implements only the accepted clean-room slice in an isolated branch/worktree; one writer by default.
- **Benchmark verifier** — runs paired full-session evaluation or, for cost-only tools, a cost-economics gate.
- **Security/privacy reviewer** — checks raw-content boundaries, proxy/CA risk, tenancy, secrets and fail-closed behavior.
- **Independent verifier** — reviews exact head, tests, evidence receipts and non-claims; worker cannot self-approve.

## Next bounded engineering slices

1. Promote the verified Wave 1 source identities into the machine registry with canonical source references.
2. Add an output-reduction evidence contract that feeds the existing harness evaluator and benchmark-integrity system.
3. Add context-virtualization/repository-retrieval evidence fields without storing raw content.
4. Build synthetic negative tests: missing errors after reduction, retry-induced token regression, stale repository index, retrieval miss, cache-prefix invalidation and cost-only routing mislabeled as token savings.
5. Continue source identification across structured encoding, repository graph/symbol retrieval, persistent memory, semantic cache, prompt compression, routing and budget-control families.

## Non-claims

This wave does not claim parity with any donor, does not reproduce upstream benchmark percentages, does not certify production savings, and does not authorize merge or deployment. It establishes the portfolio control plane and verified first source identities so implementation can proceed without violating the reverse-engineering order of operations.
