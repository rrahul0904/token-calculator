# TauCode — REA reverse-engineering dossier (2026-10-22)

**Class:** DONOR_REFERENCE to Agent Work OS; TOKEN_INTELLIGENCE_MODULE for the token-saving slice.
**Source:** https://www.reddit.com/r/freetoolsAI/comments/1x9zzm2/
**Upstream repo:** https://github.com/AbdoKnbGit/tau
**Pinned reference commit:** 4af42848797f4247ff2a9a9b4043288d1a8366e7
**Package at intake:** @abdoknbgit/tau 0.92.43; upstream package metadata declares MIT license.
**Owning repositories:** rrahul0904/token-calculator (measurement), rrahul0904/agent-work-os (execution/policy).

## Findings and confidence

| Capability | Source evidence | Status | Planned owner |
| --- | --- | --- | --- |
| Native model adapters: 28 claimed in post, 30 in current README | Reddit post + GitHub README | Claimed; not independently run | Agent Work OS |
| Cheap/normal tool modes | README command list | Documented; no measured effect | Agent Work OS |
| Structure-first, ranged code read | src/tools/FileReadTool/skeleton.ts | Inspected algorithm; not benchmarked | Token Intelligence |
| Repository retrieval plus change-risk preflight | src/tools/RepoContextScoutTool/RepoContextScoutTool.ts | Inspected | Agent Work OS |
| Python-kernel multi-file execution | post and README | Claimed; benchmark lacking | Agent Work OS |
| Persistent subagents, remote approval and Git snapshot tools | README and tool folder inventory | Source surface seen; safety not audited | Agent Work OS |
| Model usage/cache/cost telemetry | src/cost-tracker.ts | Source-inspected | Existing Token Intelligence analytics |

Source inspection is not runtime verification. The upstream author's cost, reliability and quality comparisons are not independent evidence. Reassess upstream drift against the pinned commit before deeper integration.

## Clean-room architecture

Public TauCode patterns -> REA evidence and provenance -> Agent Work OS approval/policy + evidence gates -> Token Intelligence context selection and economics -> Capability Fabric for future cross-harness distribution.

No donor source, branding, prompts or visual assets were copied. If future work directly incorporates MIT-licensed donor code, preserve required notices. Keep remote sessions, multi-agent writes, approvals and shell security under Agent Work OS, not the public calculator.

## P0 implemented in isolated branch

- src/lib/optimization/context-packet.ts: read-only deterministic candidate scoring, numbered excerpt ranges, character caps, max-file caps, excluded sensitive/unsafe paths, private-key block exclusion, simple inline credential masking, and an anti-overhead fallback for small files.
- src/components/context-packet-planner.tsx: client-only source paste, query, budget, inspection, copy and limitation warnings. The feature does not upload submitted source text.
- src/app/tools/context/page.tsx: standalone browser tool at /tools/context; no top-level navigation promotion until quality gates pass.
- tests/context-packet.test.ts: keyword selection, path exclusions, redaction, bounded output, reproducibility, no matches, tiny-file fallback and validation.

**Design constraints:** the pure function does not execute code, touch disk, run a provider, search a repository, or persist inputs. The UI processes a single manually pasted non-sensitive file; full repo scanning is not implemented. Regex redaction is NOT DLP. Retrieval is keyword-based, not AST/LSP semantic analysis. Source excerpts may omit relevant dependencies. A human must inspect full source and run tests before applying an edit.

**Measurement discipline:** characterReductionPercent is only a character-count proxy. It may be negative for small inputs. It must NEVER be presented as actual token, invoice, API-cost or quality improvement.

## Evaluation and release gates

1. P0: independent tool and tests; verify PR SHA, lint/typecheck/unit tests, Next.js production build, mobile/desktop browser preview, security scan.
2. P1: benchmark at least 30 paired realistic coding tasks per workflow with fixed model, prompt and acceptance tests. Collect provider-measured input/output/cache/retry tokens, invoice cost, latency, success/quality, recall@k and citation correctness. Proposed promotion gates: at least 20% lower median billed tokens and success-rate non-inferiority within 2 percentage points. Neither threshold has yet been demonstrated.
3. P2: AST/tree-sitter structural excerpts, dependency-aware lookup, source maps, ignore-file compliance, retrieval recall experiments.
4. P3: Agent Work OS context scout, capability spec, exact-source-SHA evidence receipts, verification and reversible installation.
5. P4: guarded persistent agents, worktree isolation, snapshots, approval routing and independent replay tests.
6. P5: visual activity and cost telemetry, secure remote approvals, per-tenant identity and policy threat model.
7. P6: canary deploy only after preview verification, live integration health and releaseReady=true; rollback on violations.

**Hard blocks:** no production writes, no inferred production readiness, no unsupervised tunnel exposure, no claimed model-cost savings without provider receipts.

## Evidence and current state

At implementation intake, the pinned upstream commit was 4af42848797f4247ff2a9a9b4043288d1a8366e7. The project module was compiled with local TypeScript 5.8.3 and exercised with focused assertions on a synthetic fixture; the local case selected 114 characters from 1,898 (93.99% fewer characters). This synthetic *character* result cannot establish token or dollar savings. Full repository CI, Next.js build, browser preview and real provider comparisons remain unverified until exact-SHA external receipts exist.

Do not merge or deploy on the strength of this document. A draft PR is the evidence collection and review location.
