# REA dossier — TokenEconomizer / repository-experience token economy

**Intake:** https://lnkd.in/p/gFtKrb3w (Alena Panshina, 2026-10-21)  
**Canonical source:** https://github.com/microsoft/TokenEconomizer  
**Inspected upstream main SHA:** \`29e037edfad0528e6e0a131a62a2432a37836833\` (2026-10-19)  
**Paper:** https://arxiv.org/abs/2610.22732, submitted 2026-10-15  
**License:** Apache-2.0 at repository root; check third-party/component licenses before any code import.  
**Tracker:** #75. **Classification:** EXTENSION/MODULE to \`rrahul0904/token-calculator\`. **No new standalone repo.**

## 1. Source and evidence

Source artifacts examined: public LinkedIn post and comments; upstream README; upstream \`docs/ARCHITECTURE.md\`; upstream \`docs/PLUGIN.md\`; paper abstract. First-party source reports cache-aware cost savings of **18.4–30.9%** with comparable task success across tested coding-agent settings. These are *reported research outcomes*, not reproduced Token Intelligence results.

Important nuance: paper's sealed benchmark used controller-selected pruning. The released interactive plugin proposes deny-list changes for human approval. Do **not** claim the benchmark savings for approval-only product behavior without independent measurement.

Upstream plugin supports Claude Code, Codex, Copilot CLI and Pi, but mechanisms differ by platform: Claude tools, Codex capability packages, Copilot MCP servers, and no tool pruning on Pi. The plugin locally stores state under \`~/.tokeneconomizer\`; by default its helpers make no model calls. In the published upstream implementation the guard redirects before headless stopping, and all hooks fail open. These details are observations of **upstream**, not Token Intelligence shipping features.

## 2. User workflow and pain points

1. Developer opts in to local metadata-only observation for a repository/agent.
2. Complete tool catalogs, used tools, completed tasks, and anonymous outcome fingerprints accumulate as *scoped evidence*.
3. The advisor proposes an environmental micro-skill for review only after repeated corroboration and no contradiction.
4. The advisor proposes excluding a tool only after it was observed loaded and unused across enough **distinct** complete-catalog sessions. Protected user, planning, web and verification tools are excluded.
5. Repeated failed-action fingerprints without intervening progress trigger a review advisory, not an interruption.
6. Future platform-specific adapter could show a diff, require approval, apply to next sessions, verify, and restore.
7. Full-session and quality-preserving experiments are the *only* path to verified savings.

Feedback risk: a rare tool can be essential on a later task; savings from automatic disabling may not transfer to opt-in, user-approved disabling. Cache effects can also make naive per-tool token counts overstate financial savings.

## 3. Capability & failure decomposition

| Mechanism | Required evidence | Unsafe failure | Phase A response |
| --- | --- | --- | --- |
| Micro-skills | distinct-session corroborations and contradiction detection | stale/malicious instruction injection | opaque fact ID only; human approval required; no injection |
| Tool pruning | full loaded catalog and usage across distinct scoped sessions | unseen/essential tool disabled | recommendation only; protect tools, fail closed on partial catalogs |
| Failure-loop guard | stable hashed failure fingerprint and non-progress epoch | premature termination of difficult work | advisory only; no automatic interruption |
| Cost accounting | cache-aware measured session/turn receipts incl. controller overhead | fake/composed ROI | delegate to existing verified-savings engine; zero new savings claims |
| Rollback | approved settings delta and original file identity | lost agent capabilities | not implemented; Phase B must have exact restore proof |

Inputs in the Phase A adapter are anonymous/opaque identifiers and metadata; raw code, raw prompts, shell command text, tool payloads and model responses are not accepted as telemetry.

## 4. Competitive overlap and integration map

Do not duplicate the existing platform:
- **PR #57:** harness optimizer evidence, lazy tools, repository-aware context and quality gates.
- **PR #61:** donor lifecycle registry; unified portfolio measurement; authoritative paired-run evidence linkage.
- **PR #74:** optimization change journal and before/after *observational* effectiveness, distinct from causal/verified ROI.
- **PR #72:** production release baseline/blocked provider configuration.

**Owned new addition:** \`src/lib/optimization/agent-session-advisor.ts\` provides operational metadata-based proposals for three mechanisms. It is intentionally independent from database, billing, hooks, MCP and prompt inputs. It must integrate with existing session receipts and paired-run experiment adapters in later work; creating new evaluation ledgers is forbidden.

## 5. Phase A behavior contract

Function: \`adviseAgentSessionEfficiency(projectId, agent, evidence, options)\`.

- Repository+agent scopes mandatory; repeated \`sessionId\` is counted once.
- Tool exclusion advice needs at least five complete catalogs by default; any partial catalog in the inspected cohort prevents pruning. Any observed use prevents pruning.
- Core safety tools are protected; platform adapters must expand the protected allowlist.
- Micro-skill fact ID needs at least three distinct confirmations by default; a contradiction blocks the proposal regardless of support. The advisor never supplies executable instructions.
- Failure advice needs a suffix of three failed calls with the same externally computed SHA-256 fingerprint and unchanged progress epoch.
- Advice contains \`approvalRequired: true\` or \`humanReviewRequired: true\`.
- Invariants: \`writesConfiguration=false\`, \`autoPrunesTools=false\`, \`injectsUnreviewedFacts=false\`, \`interruptsAgent=false\`, \`savingsVerified=false\`.
- Input data is **untrusted**. Downstream collectors must validate canonical project identity, hashed fingerprint authenticity, catalog completeness, and authenticated session receipt lineage before any action. This code is not a privileged policy engine.

Focused tests cover positive advisory, protected/used tools, partial catalogs, tenant/project isolation, session deduplication, contradiction, progress reset, success reset, and rejection of raw failure signatures.

## 6. Roadmap stage evidence

| Stage | Status |
| --- | --- |
| 1. Source identification | COMPLETE — canonical upstream and paper identified |
| 2. Evidence/license | COMPLETE FOR INTAKE — README, architecture, plugin docs, root license, SHA |
| 3. Workflow reconstruction | COMPLETE FOR RESEARCH |
| 4. Failure decomposition | COMPLETE FOR RESEARCH |
| 5. Feedback/pain points | INITIAL — LinkedIn feedback; broader empirical user study pending |
| 6. Competitive comparison | COMPLETE AT OWN-PR BOUNDARY |
| 7. Existing primitives audit | COMPLETE AT OWN-PR BOUNDARY |
| 8. Product inclusion boundary | COMPLETE — one module, no new app |
| 9. Contracts & tests | IMPLEMENTED — focused first-slice tests |
| 10. Clean-room implementation | PHASE A CODE ONLY |
| 11. Independent verification | PENDING exact-commit CI and reviewer |
| 12. Hosted/recovery certification | BLOCKED on adapters, measurements, and existing release gates |
| 13. Tracker state | IN PROGRESS — #75 + draft PR; do not call it integrated |

## 7. Remaining stages to make this end to end

### Phase B — collector + approval (not implemented)
- Reuse authoritative local-session metrics and provider-normalized costs, tenant scope and project identity.
- Agent-specific catalog readers with completeness receipts; special care for Codex packages vs tools and Copilot MCP server grouping.
- Corroborated fact resolver with freshness, staleness, provenance and human-reviewed text; explicit opt-in context injection.
- Approval surface showing a diff, protected-tool safety review, exact file hash, scoped ownership and restore action.
- Configuration change audit stored without raw settings secrets or prompts.

### Phase C — measurable optimization and delivery (not implemented)
- Sequential randomized/counterbalanced same-task-cohort runs on Claude Code/Codex/Copilot; complete cache-aware input, cached-input and output costs, tool controller overhead, retries, fallbacks and grader success.
- Compare advice-only, approved pruning, micro-skills, failure advisory, and combined plan. Never sum individual percentages.
- Rejection on statistically meaningful success/quality regressions even when dollar savings appear.
- Full CI + CodeQL + integration + browser/privacy smoke and exact SHA receipt; production security and runtime verification.
- Rollout only after PR chain reconciliation and #72 runtime/WorkOS/Stripe/MCP/GitHub configuration blockers are resolved.

## 8. Explicit REA non-goals and stop conditions

No source or UI clone. No upstream earnings/savings claim presented as ours. No unreviewed local agent hook install. No write to user settings without opt-in. No raw work-content telemetry. No self-approval by writing agent. No production rollout from this research PR.

**Next verifier must check:** TS strict/typecheck and Vitest tests on *this exact branch SHA*; independent security review for tool-id spoofing, input size bounds, stale facts and reversible settings semantics before accepting any live adapters.
