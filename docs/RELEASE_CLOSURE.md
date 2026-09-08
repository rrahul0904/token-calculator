# Token Intelligence Release Closure

Last reconciled: 2026-09-08 UTC

This document records evidence. It does not convert an unverified dependency into PASS.

## Release identity

- Repository: `rrahul0904/token-calculator`
- Canonical release branch: `release-candidate-full-site`
- Release PR: #14 — `release: full-site integration candidate`
- UI redesign PR: #15 — merged
- Stable production domain: `https://token-intelligence-eight.vercel.app`
- Vercel project: `token-intelligence` (`prj_ADoR3dW8VcpJOaQcagZXOpioyM7l`)
- Neon project: `token-intelligence` (`restless-queen-06517393`)
- WorkOS Production environment: `environment_01M1G0NZHV4J3CNS2WQZB2JER4`
- Stripe live account context: `acct_1QrNa7RB8OGmEnBw`

The exact final release SHA must be recorded only after the closure commits have passed CI and an exact-SHA Preview is certified.

## Current certification matrix

| Area | Status | Evidence |
|---|---|---|
| Release candidate CI before closure hardening | PASS | CI run 34176837431 on SHA `5e09140969652b8bc2851e04befec0653b56e8e8` passed secret scan, lint, typecheck, tests, migrations, DB integration, SDKs, CLI, build and Playwright |
| Closure hardening CI | FAIL | New release/auth/docs commits require a new exact-head CI run before certification |
| Responsive browser matrix before closure hardening | PASS | Exact prior release SHA passed Playwright production smoke/browser matrix |
| Neon production migration ledger | PASS | Production ledger contains migrations `0000` through `0007`, each with a checksum |
| Neon validation branch | PASS | `release-validation-full-site` exists and is ready from production baseline |
| Stripe live catalog | PASS | Token Intelligence Pro is $15/month; Team is $29/month |
| Stripe webhook object | PASS | Live endpoint `we_1UDCwARB8OGmEnBwuRlJ9w5V` exists for the exact event types implemented by the application |
| Stripe application configuration | FAIL | Live Production health reports billing configuration blocked; webhook signing secret is not available to this runtime |
| WorkOS production AuthKit redirects | FAIL | Production currently has zero redirect URIs |
| WorkOS production logout URIs | FAIL | Production currently has zero logout URIs |
| WorkOS production web origins | FAIL | Production currently has zero web origins |
| WorkOS production webhook | FAIL | No WorkOS webhook endpoint is configured |
| WorkOS MCP OAuth resource | FAIL | No AuthKit OAuth resource is configured |
| WorkOS production custom AuthKit domain | FAIL | No Hosted AuthKit/Auth API custom domain is configured |
| Vercel Production source SHA | FAIL | Production still serves old SHA `126668c753c948449deb68043feb6948a6ede2c9` |
| Vercel Production configuration | FAIL | Stable Production health reports database/auth/billing/credential-vault configuration blocked |
| Exact-SHA Vercel Preview | FAIL | No certified Preview for the post-closure release head exists yet |
| Production health | FAIL | Current stable Production is the older deployment and is not release-ready |
| Rollback documentation | PASS | `docs/ROLLBACK.md` records the known-good deployment and recovery process |

## Closure changes implemented

- Production readiness now fails closed when the signed WorkOS webhook configuration is absent.
- Production readiness now fails closed when MCP OAuth resource-server configuration is absent.
- `release:config --require-production` now treats MCP OAuth as a required production dependency.
- Added an AuthKit sign-out route and exposed sign-out in the authenticated workspace.
- Added readiness regression tests using secret-scan-safe fixtures.
- Reconciled the Production runbook to PR #14 / `release-candidate-full-site` and migrations `0000`–`0007`.
- Added a dedicated rollback runbook.

## External blockers

### WorkOS Production redirect/logout/origin configuration

**BLOCKER:** Production AuthKit has no redirect URI, logout URI, or web origin.

**WHY IT CANNOT BE AUTOMATED:** Both application-scoped and environment-scoped WorkOS mutations, including dry-run validation, return `FORBIDDEN` for the connected ADMIN identity in the Production environment.

**EXACT ACCOUNT/SERVICE:** WorkOS project `project_01M1G0NYYZK7N4KFVE8XVYVGV0`, Production environment `environment_01M1G0NZHV4J3CNS2WQZB2JER4`.

**EXACT VALUE/ACTION REQUIRED:** Configure:
- Redirect URI: `https://token-intelligence-eight.vercel.app/auth/callback`
- Default logout URI: `https://token-intelligence-eight.vercel.app/`
- Web origin: `https://token-intelligence-eight.vercel.app`
- Sign-in URL: `https://token-intelligence-eight.vercel.app/sign-in`

**WHERE TO APPLY IT:** WorkOS Production AuthKit Redirects / application configuration using an identity permitted to edit Production.

**HOW TO VERIFY IT:** Re-query redirect URIs, logout URIs, web origins and initiate-login URL; then perform a real sign-in/callback/sign-out round trip.

**WHAT BECOMES UNBLOCKED AFTERWARD:** WorkOS production authentication/session certification.

### WorkOS Production webhook and MCP OAuth resource

**BLOCKER:** No Production WorkOS webhook endpoint or AuthKit OAuth resource is configured, and no production custom AuthKit/Auth API domain is available.

**WHY IT CANNOT BE AUTOMATED:** Production configuration mutations are permission-restricted for the connected WorkOS ADMIN identity; the application also requires the resulting signing/domain configuration to be installed in Vercel Production.

**EXACT ACCOUNT/SERVICE:** WorkOS Production environment `environment_01M1G0NZHV4J3CNS2WQZB2JER4`.

**EXACT VALUE/ACTION REQUIRED:** Configure the signed WorkOS directory webhook for the application's implemented `dsync.*` lifecycle events, configure the MCP resource URI `https://token-intelligence-eight.vercel.app/mcp`, and provide the corresponding Production AuthKit domain/signing configuration.

**WHERE TO APPLY IT:** WorkOS Production plus Vercel Production environment variables.

**HOW TO VERIFY IT:** WorkOS endpoint/resource queries return the configured objects; signed directory lifecycle delivery succeeds; `/api/health` reports `workosWebhook=live` and `mcpOAuth=live`.

**WHAT BECOMES UNBLOCKED AFTERWARD:** Directory lifecycle and MCP OAuth certification.

### Vercel Production environment and exact-SHA deployment

**BLOCKER:** The stable Production deployment is an older `main` SHA and lacks launch-critical environment configuration.

**WHY IT CANNOT BE AUTOMATED:** The connected Vercel tool available to this execution can inspect projects/deployments/logs but does not expose environment-variable mutation or exact-Git-SHA deployment/promotion from this remote GitHub branch. The repository is not locally linked to an authenticated Vercel CLI session.

**EXACT ACCOUNT/SERVICE:** Vercel team `team_zmEezpOKGZy2sH5nqTfO44LD`, project `prj_ADoR3dW8VcpJOaQcagZXOpioyM7l`.

**EXACT VALUE/ACTION REQUIRED:** Install the production values named in `.env.example` / `docs/PRODUCTION_RUNBOOK.md`, deploy the final exact release SHA as Preview, certify it, and promote that same artifact to Production.

**WHERE TO APPLY IT:** Existing Vercel project `token-intelligence`; do not create a second project.

**HOW TO VERIFY IT:** Exact deployment metadata matches the certified SHA; `/api/health` returns 200 with `releaseReady: true`; auth, database, billing, data controls, admin and MCP flows pass live smoke tests.

**WHAT BECOMES UNBLOCKED AFTERWARD:** Final Preview/Production certification and PR #14 merge.

## Final determination

`NOT PRODUCTION CERTIFIED`

Do not change this determination to `PRODUCTION CERTIFIED` until every FAIL above has verified PASS evidence.
