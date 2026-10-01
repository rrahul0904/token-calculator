# Release evidence - 2026-10-01

## Candidate identity

- Repository: `rrahul0904/token-calculator`.
- Branch: `codex/token-intelligence-reconciliation-20261001`.
- Candidate base HEAD: `44e62058558dc4ff28fdcb337f329e7c1b072927`, 15 commits ahead of fetched `origin/main` before this implementation snapshot was committed.
- This evidence file is included in the final local candidate commit. Its exact SHA is reported in the implementation handoff. Nothing was pushed.
- Local environment: official Node.js 22.23.3 macOS x64 archive; published SHA-256 verified.

## Local verification

| Gate | Result | Evidence |
| --- | --- | --- |
| ESLint | Pass | `npm run lint` |
| TypeScript | Pass | `npm run typecheck`; Next production build also completed TypeScript validation |
| Unit suite | Pass | 69 files passed, 6 skipped; 293 tests passed, 28 DB-dependent integration tests skipped by the default command; single worker |
| Donor-focused tests | Pass | 4 files, 20 tests: local session receipts, local scan wiring, wire attribution, historical-work normalization |
| Postgres integration suite | Pass | Separately run against an isolated PostgreSQL 18 instance; 6 files, 28 tests passed |
| Migration/schema verification | Pass | Fresh database accepted migrations `0000` through `0011`; verified 59 tables, 17 required triggers, 25 required indexes, and 106 foreign keys |
| Drizzle schema check | Pass | `npm run db:check` |
| Pricing diff | Pass | No material changes |
| Gitleaks | Pass | v8.24.3; full fetched history plus working tree; no leaks; binary checksum verified |
| Secret policy | Pass | Valid config, no tracked runtime env files, no forbidden tracked paths |
| Production dependency audit | Pass | `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities |
| Full dependency tree audit | Warning | `npm ci` reported 7 advisories (6 moderate, 1 high); production-only audit is clean. No automatic upgrades were applied. |
| TypeScript SDK | Pass | `npm run sdk:build` |
| Python SDK import | Pass | Imported `TokenIntelligenceClient` and `TokenIntelligenceError` |
| CLI smoke | Pass | `npm run ti -- --help` |
| Production build | Pass | `npm run build`; Next.js 16.3.6 compiled and generated all 123 static pages |
| Browser E2E | Pass (hosted) | GitHub `CI / verify` ran the production smoke across Chromium desktop/mobile and WebKit desktop/tablet. No local browser server was started. |
| `git diff --check` | Pass | No whitespace errors |

The original local Vitest config used URL `.pathname` for the `@` alias. In this workspace, whose path contains spaces, that encoded the path and prevented module resolution. It now uses Node's `fileURLToPath`; the full suite passes locally with this fix.

## Remote and deployment gates

- Draft PR: https://github.com/rrahul0904/token-calculator/pull/53. On candidate SHA `f7b123eed3b8ae77b56df91a9707a5e422e67468`, CI run [36910255231](https://github.com/rrahul0904/token-calculator/actions/runs/36910255231) passed in 6m13s, including the full browser matrix; Security CodeQL run [36910255256](https://github.com/rrahul0904/token-calculator/actions/runs/36910255256) passed in 1m19s. GitHub reports merge state `CLEAN`; the PR remains draft and unmerged.
- Donor evidence observed: PR #49 focused verification and CI run #899 passed, with CodeQL passing. PR #45 CI run #897 failed at Playwright production smoke; its migration and benchmark changes were not integrated. PR #52 run #891 was in progress when last checked; the integrated PR #53 exact-head checks above are green.
- Existing Vercel project linkage in repository workflows pins team `team_zmEezpOKGZy2sH5nqTfO44LD` and project `prj_ADoR3dW8VcpJOaQcagZXOpioyM7l`; the configured stable URL is https://token-intelligence-eight.vercel.app. The stable URL responds HTTP 200, while `/api/health` reports `database: not_configured` and auth, billing, credential vault, and GitHub as configuration-blocked; `/api/build` returns 404.
- The latest GitHub-recorded Vercel Preview is an older successful deployment from 2026-09-03 at SHA `17fab8f01a27003d8ed0c8e862404072bc1bd801`: https://token-intelligence-53dhgdc8q-rrahul0904-5013s-projects.vercel.app. It responds HTTP 200; its 2026-10-01 health endpoint reported application/database/auth/credential-vault/MCP `ok`/`live`, billing and GitHub configuration-blocked, and telemetry/Redis not enabled. `/api/build` returns 404. GitHub has no deployment record for candidate SHA `f7b123eed3b8ae77b56df91a9707a5e422e67468`.
- The Vercel API/CLI/browser session is not available here: no `vercel` CLI, local `.vercel` linkage, browser session, or local `VERCEL_TOKEN` was found. GitHub API lists no repository Actions secrets, no `Preview` environment secrets, and no `Preview` environment variables. Vercel project environment names/values, build logs, current Git repository binding, and the Vercel Production Branch setting could not be inspected; values were not exposed. Repository release workflows pin the existing team/project IDs above, but this does not substitute for reading live Vercel project settings.
- GitHub's repository deployment records contain no Production deployment entry, so the exact currently deployed Production SHA and Vercel build-log status could not be verified. The documented Neon Production database branch is `main`; that is not evidence of the Vercel Git Production Branch setting.
- No candidate Preview is certified. The missing deployment credential, Preview runtime configuration, persistent database identity, and external WorkOS/Stripe/UAT gates in issue #35 prohibit production promotion. No merge or promotion was performed.
- The isolated Docker database and runtime used for integration evidence are stopped. No local web server is left running.

## Scope boundaries

- Occam receipts and session deduplication are integrated in the local audit/scan paths; these are not independently audited provider bills or verified savings.
- Cost-xray adds a metadata-only wire attribution contract and reconciliation tests. It does not intercept provider traffic or capture exact per-span tokens.
- Bough adds normalized deterministic metadata reconstruction and explicitly heuristic segmentation. It does not import editor history files, enrich from Git, or persist/render reconstructed work.
- The Route Gateway production graduation is incomplete. The isolated pilot remains fake-provider-only and has not been deployed or certified against paid providers.
- PR #45 full-session benchmark integrity was held out because its observed CI failed. No universal savings claim is made.
- TokenCalc-seven PR #12 was reconciled capability by capability; the closed branch was not merged wholesale.
