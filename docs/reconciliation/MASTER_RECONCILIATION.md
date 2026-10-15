# Token Intelligence Master Reconciliation

**Audit baseline:** `f6372728e0de9cafdb32a1c5f5f867ad58a8c541` (`main`)  
**Production deployment:** `dpl_3KPi6FSVHmUdpm9qhdVvGKYmM76Q`, Ready on Vercel Production  
**Stable alias:** <https://token-intelligence-eight.vercel.app>  
**Baseline receipt:** [`baseline-2026-10-13.json`](baseline-2026-10-13.json)  
**Open PR manifest:** [`open-pr-manifest.json`](open-pr-manifest.json)
**Phase 0/1 candidate receipt:** [`phase0-1-candidate.json`](phase0-1-candidate.json)

## Release State

The exact `main` SHA is deployed and the latest GitHub Actions CI and CodeQL workflows passed (runs `38339741263` and `38339741400`). This is not a release-ready certification: the stable alias reports `/api/health` HTTP 503 and `releaseReady: false`.

Runtime health reports database identity verified, AuthKit live, WorkOS webhook live, vault live, retention live, and MCP service OK. Billing, MCP OAuth, and GitHub integration remain configuration-blocked. Vercel's current Production variable inventory has no Stripe, MCP OAuth, or GitHub integration variables. No provider secret values were revealed or changed. Direct Stripe, WorkOS, and Neon console configuration was not independently inspected; Neon identity is verified by the deployed runtime only.

The project-variable inventory does not show `WORKOS_COOKIE_PASSWORD` even though runtime health says authentication is live. Resolve this deployment-snapshot/configuration-source discrepancy before rotating or changing WorkOS variables. Do not infer that a listed variable is correctly scoped merely from the runtime aggregate status.

Production dependency audit on the exact main lockfile found 0 vulnerabilities across 41 production dependencies. Dependabot alerts could not be queried because repository Dependabot alerts are disabled and the available GitHub token lacks the required scope. CodeQL reports eight open alerts on the baseline: three high and five medium; the current main workflow being green does not clear these findings. A read-only Gitleaks scan of the candidate worktree and all 1,240 commits found no leaks.

## Canonical Architecture

Current `main` already has the platform foundations that donor branches must extend rather than duplicate: canonical wire attribution (`src/lib/telemetry/wire-attribution.ts`), metadata-only local usage/session receipts (`src/lib/optimization/local-session-metrics.ts`), historical-work reconstruction (`src/lib/historical-work/reconstruction.ts`), experiment evidence and verified-savings gates (`src/lib/evaluations/experiment-evidence.ts`, `src/lib/evaluations/verified-savings.ts`), and governed gateway execution (`src/lib/gateway/execute.ts`). The reconciliation manifest records exact capability dispositions for all 18 open PRs.

The migration journal and SQL inventory agree on 12 applied-source migrations, `0000` through `0011`. Five PR candidates attempt to introduce `0012`; only one sequential, reviewed migration chain may be produced. No production migration application is claimed from this source inventory or database health check.

GitHub outcome attribution is optional for this release: it is not part of the mandatory `releaseReady` checks. Health reports an absent integration as `not_enabled`, partial configuration as blocked, and complete variable presence as `configured` rather than `live`; no GitHub App installation/webhook certification is claimed. Release readiness now also requires verified Neon project and branch identity, not merely a successful database connection.

## PR Dispositions

| PR | Capability | Disposition | Key constraint |
|---|---|---|---|
| #44 | Wire attribution | Superseded | Contract already integrated; preserve useful research only. |
| #45 | Full-session benchmark integrity | Integrate bounded | Preferred over #55; reconcile `0012` migration. |
| #46 | Fake-provider gateway pilot | Benchmark-only | Separate pilot is not production provider certification. |
| #49 | Local session receipts | Integrated / superseded | Capability already on `main`. |
| #51 | Bough research | Integrate bounded | Keep research distinct from #59 importer code. |
| #52 | Release CI repairs | Integrated / superseded | Repairs are already represented on `main`. |
| #54 | Atomic gateway quota reservation | Integrate bounded | Extract quota-only changes; reconcile `0012`. |
| #55 | Benchmark integrity | Superseded | Overlaps #45 and shares its migration name. |
| #57 | Harness efficiency | Integrate bounded | Rebase on `main`; verify MCP contract. |
| #58 | Local Cost-Xray collector | Integrate bounded | Wire attribution exists; prove metadata-only upload. |
| #59 | Bough history import | Integrate bounded | Extend reconstruction without copying its base. |
| #61 | Multi-donor optimization portfolio | Benchmark-only | Too broad and stacked to merge as one unit. |
| #63 | Provider quota monitor | Blocked | Stacked on #61, CodeQL failure, and `0012` collision. |
| #65 | Cache/session risk | Integrate bounded | Reconcile conflicting verify results. |
| #66 | Reversible live-context transform | Integrate bounded | Isolate from #61 and repair contracts/tests. |
| #68 | Revenue normalization/unit economics | Integrate bounded | Preserve evidence classes; reconcile with billing state. |
| #69 | Revenue ledger | Integrate bounded | Depends on #68 and needs a unique ordered migration. |
| #71 | Deterministic provider pool | Benchmark-only | Prove governed policy/quota/failure behavior first. |

“Integrate bounded” is a capability disposition, not approval to merge. Candidates must be extracted onto current `main`, independently reviewed, and validated on exact head SHA. Do not close candidate PRs until their unique behavior/evidence is preserved in the manifest or a replacement PR.

## Immediate Work

1. Land the bounded security fixes for true-positive CodeQL findings and run hosted CodeQL on the exact PR head; handle remaining alerts through evidence-backed triage.
2. Configure Stripe Test-mode variables, MCP OAuth resource-server settings, and GitHub integration only through their provider dashboards or protected deployment environments; secrets must not enter chat or source control.
3. Run the existing integration verifiers against the designated Preview environment, with exact database and identity scopes.
4. Re-run health and certification after a redeploy; require HTTP 200 and `releaseReady: true` before UAT or production promotion.
5. Reconcile donor work only after Phase 1 is certifiable; use `open-pr-manifest.json` for bounded sequencing and migration serialization.

## Security Review

This branch implements fixes for the reviewed Stripe portal lookalike-host check, the collector file identity/read race, CLI credentials sent to configurable API origins, local telemetry privacy assertions, and newline-safe GitHub Actions outputs. Focused tests, typecheck, and lint pass locally. These are not yet reflected in GitHub's alert state; a fresh exact-head CodeQL run is still required.

CodeQL alerts #2 (HMAC-SHA-256 signature generation) and #3 (dedicated-worker message handling) were independently assessed as likely false positives; leave them open for GitHub security review rather than suppressing them in code. Full-history secret scanning and Dependabot audit access remain outstanding.

## Non-Claims

- A Ready Vercel deployment and green CI do not prove billing, MCP OAuth, GitHub integration, or authenticated UAT works.
- The system is not production-certified while `releaseReady` is false.
- Runtime database identity verification is not a direct Neon console audit.
- No Stripe, MCP OAuth, or GitHub credentials were created, revealed, or changed.
- No donor PR was merged or closed during this audit.
