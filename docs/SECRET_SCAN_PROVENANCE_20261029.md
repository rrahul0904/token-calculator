# 2026-10-29 — Token Intelligence historical Gitleaks triage

**Status:** three *candidate* false positives scoped for owner/independent review. Owner states no flagged credentials are real. Builder inspected test identity setup and exact source lines. Independent security approval has **not** been recorded; production release is not certified.

## Evidence and exact-scope dispositions

GitHub Actions CI 40801581423 used Gitleaks v8.24.3 with `--config=.gitleaks.toml --redact --exit-code=2 --log-opts="--all"`. Redacted triage reported these three `generic-api-key` fingerprints, and no other finding types on that head:

| Finding | Historical origin | Observed code behavior | Proposed disposition |
| --- | --- | --- | --- |
| TI-01 | `5f355f905276fb6a9fd76bc323f884a6ae5c336a:tests/inference-simulations-db.test.ts:generic-api-key:123` | Test calls `post(team.secret,...)`; fixture constructs `team.secret` via `generateApiKey()`, writes hash to disposable test DB | Synthetic test secret, exact fingerprint exception |
| TI-02 | `dc8c99b92fbdce7bdcbd9bb97b8e2cf972e2caa3:tests/inference-live-db.test.ts:generic-api-key:139` | Rate-limit assertion invokes `post(rpm.secret,...)`; identity factory creates `secret=generateApiKey()` | Synthetic test secret, exact fingerprint exception |
| TI-03 | `dc8c99b92fbdce7bdcbd9bb97b8e2cf972e2caa3:tests/inference-live-db.test.ts:generic-api-key:149` | Unpriced-model test invokes `post(price.secret,...)` from that same generated test identity factory | Synthetic test secret, exact fingerprint exception |

The respective tests generate per-test values; those lines do not embed a fixed OpenAI/Anthropic/Google/Stripe/WorkOS provider API key. No candidate secret content is included here. The findings were introduced in test-specific commits and do not establish production-key exposure.

Only the three exact `commit:path:rule:line` fingerprints above are added to `.gitleaksignore`; no broad commit, file, rule, or history-wide exclusions were introduced. The mandatory **full-history scan remains enabled and fail-closed**. Any new fingerprint, moved line, new secret value at another location, or other rule still requires investigation.

## Approval and verification gates

- [x] Owner statement: flagged data are not actual credentials (2026-10-29).
- [x] Exact source/factory provenance reviewed by implementing engineer.
- [x] Three precise fingerprints recorded for scoped suppression.
- [ ] Same-head full-history Gitleaks v8.24.3 rerun passes with zero **unresolved** findings.
- [ ] Full dependency, unit, integration, DAST and browser pipeline passes at exact final SHA.
- [ ] Independent authorized reviewer signs off classifications and confirms no relevant credential was ever used outside disposable tests.
- [ ] Production provider, tenancy, billing and usage receipts independently validated.

**This document is not an independent security certificate or authorization to deploy.** Do not rewrite history, publish candidate values or disable Gitleaks. Release issue #82 remains open until the independent review is complete.
