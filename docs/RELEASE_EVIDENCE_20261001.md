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
| Browser E2E | Not run | The browser dependency setup was interrupted when Docker Desktop restarted. Per user direction Docker is stopped; no database-backed E2E run or browser certification is claimed. |
| `git diff --check` | Pass | No whitespace errors |

The original local Vitest config used URL `.pathname` for the `@` alias. In this workspace, whose path contains spaces, that encoded the path and prevented module resolution. It now uses Node's `fileURLToPath`; the full suite passes locally with this fix.

## Remote and deployment gates

- GitHub write credentials are unavailable in this workspace. The branch has not been pushed, so GitHub Actions, CodeQL, and exact-head CI have not run for this candidate.
- Donor evidence observed: PR #49 focused verification and CI run #899 passed, with CodeQL passing. PR #45 CI run #897 failed at Playwright production smoke; its migration and benchmark changes were not integrated. PR #52 run #891 was in progress when last checked; green exact-head CI was not established.
- Vercel is the preferred web host for this Next.js application, but repository issue #28 reports missing Actions secret `VERCEL_TOKEN`. No Vercel deployment token or alternate host credentials are configured here.
- No exact-SHA Preview exists, so preview certification cannot be completed. Production promotion remains prohibited until Preview certification and the external WorkOS, Stripe, database, and Vercel runtime gates in issue #35 are resolved.
- The isolated Docker database and runtime used for integration evidence are stopped. No local web server is left running.

## Scope boundaries

- Occam receipts and session deduplication are integrated in the local audit/scan paths; these are not independently audited provider bills or verified savings.
- Cost-xray adds a metadata-only wire attribution contract and reconciliation tests. It does not intercept provider traffic or capture exact per-span tokens.
- Bough adds normalized deterministic metadata reconstruction and explicitly heuristic segmentation. It does not import editor history files, enrich from Git, or persist/render reconstructed work.
- The Route Gateway production graduation is incomplete. The isolated pilot remains fake-provider-only and has not been deployed or certified against paid providers.
- PR #45 full-session benchmark integrity was held out because its observed CI failed. No universal savings claim is made.
- TokenCalc-seven PR #12 was reconciled capability by capability; the closed branch was not merged wholesale.
