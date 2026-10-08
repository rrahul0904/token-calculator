# Quota → Token Intelligence Provider Quota Monitor

Status: Phase A implementation candidate, not production-certified  
Tracking: #62  
Donor: `pinkpixel-dev/quota`  
Reddit intake: r/coolgithubprojects, “Quota: Monitor your AI usage in one place” (2026-10-07)

## 1. Source identification

Canonical donor source is the public `pinkpixel-dev/quota` repository, licensed Apache-2.0. The public repository exposes a Tauri desktop app, VS Code/OpenVSX extension, Rust CLI, shared `quota-core`, and a Herdr plugin.

Evidence classes used for this dossier:

| Claim | Evidence class | Source |
| --- | --- | --- |
| Product purpose and supported provider list | first-party-public | donor README + Reddit author post |
| Local credential and usage behavior | official-source | `quota-core` source |
| Release behavior | first-party-public | GitHub releases/changelog |
| User pain points | community | donor GitHub issues |
| Competitive surface | public-source / first-party-public | public competitor repositories |

No upstream source, UI, branding, fixtures, prompts, or installer assets are copied into Token Intelligence.

## 2. Evidence collection

Observed donor capabilities:

- unified dashboard for multiple AI/dev provider accounts;
- provider ordering, visibility, pinning, and multiple dashboard layouts;
- remaining-vs-used display mode;
- periodic refresh and low-quota notifications;
- system-tray quota display;
- safe account-summary JSON export;
- VS Code/OpenVSX status bar + panel;
- standalone Rust CLI that reads provider-owned local credential stores;
- Herdr plugin backed by the CLI;
- explicit reauthentication handling for expired provider authorization;
- current advertised providers include GitHub Copilot, Codex, Antigravity, Claude Code, Kiro, Cursor, Grok, and OpenCode Go.

The donor's shared model reduces provider-specific responses into usage windows: a short label, remaining percentage, and reset time. Accounts can also have a note when authenticated but no numeric allocation is available.

For Codex, the donor reads the Codex CLI's local OAuth data read-only, does not refresh or rewrite the file, and uses the local access token only for a provider request. The observed usage endpoint is undocumented/provider-internal and therefore must be treated as unstable rather than as an official API contract.

## 3. Product and user workflow reconstruction

Primary desktop workflow:

1. User connects or already has provider credentials.
2. Provider adapter resolves a safe account identity and fetches current provider quota.
3. Provider-specific payload is normalized to one or more quota windows.
4. Dashboard renders per-provider/account quota with reset timing.
5. Background refresh updates values.
6. Optional low-quota threshold produces a notification.
7. Expired credentials preserve account context and instruct the user to reauthenticate.

CLI workflow:

1. Discover the provider-owned local credential path.
2. Read credentials without mutation.
3. Call provider quota endpoint locally.
4. Normalize response.
5. Print only safe quota/account metadata.

Token Intelligence adopts the CLI workflow first because it has the smallest secret surface and is independently testable without adding a second desktop shell.

## 4. Capability and failure-mode decomposition

Required provider-neutral states:

- `active`: authenticated and numeric quota is available;
- `signed_in_no_allocation`: authenticated but provider reports no numeric allocation;
- `not_signed_in`: provider credential file/store is absent;
- `unsupported_auth`: local login type cannot expose the requested quota (for example Codex API-key-only auth);
- `expired`: provider rejects stored authorization;
- `malformed`: local provider auth file exists but is unusable;
- `unavailable`: local read, network, endpoint, or response-shape failure.

Failure modes that must stay distinct:

- missing credentials vs expired credentials;
- no quota allocation vs endpoint failure;
- absolute reset time vs reset-after duration;
- provider endpoint schema drift;
- credential-file corruption;
- provider OAuth vs API-key login differences;
- multi-account ambiguity;
- provider-native PII accidentally entering logs or telemetry;
- background refresh updating one surface while leaving another stale;
- refresh actions changing editor/layout state;
- rate-limit percentages being mistaken for spend or token-savings evidence.

## 5. Feedback and pain-point analysis

Two donor issues materially shape the clean-room design.

First, users explicitly want broad provider coverage rather than a single-agent utility; OpenCode Go was requested because the useful product is one view across Claude Code, Codex, Antigravity, Copilot, and other tools.

Second, refresh correctness is part of the behavior contract, not a cosmetic detail. A reported VS Code issue showed the status bar refreshing while an already-open panel stayed stale, and a manual Refresh could move the panel to another editor group. Token Intelligence must treat freshness and view stability as separately testable requirements when editor/UI surfaces are added.

## 6. Competitive comparison

| Product | Strength to learn from | Boundary for Token Intelligence |
| --- | --- | --- |
| Quota | broad local provider quota normalization, desktop/editor/CLI surfaces | donor; no cloning |
| QuotaBar | broad macOS/provider coverage and provider-specific local discovery | use only as competitive evidence |
| opencode-quota | terminal/TUI orientation, setup state, quota visibility | CLI ergonomics benchmark |
| onWatch | history, daemon, SQLite, alerting and workflow telemetry | history/alerts benchmark; avoid duplicating our existing telemetry plane |
| CodeNotch / Pulse | always-visible macOS quota surfaces | later optional desktop surface, not Phase A |

Token Intelligence already owns the more important longitudinal usage/economics layer. The missing primitive is provider-native **remaining quota**, not another generic dashboard shell.

## 7. Existing internal primitive audit

Already owned in Token Intelligence:

- Codex, Claude Code, Cursor, and Antigravity local/session collectors;
- normalized run/turn/tool receipts;
- token-category accounting including cache and reasoning;
- known-vs-unknown economic handling;
- usage dashboard and provider spend views;
- budgets, findings, policies, experiments, and gateway controls;
- local CLI and metadata-only upload boundary;
- alert/webhook infrastructure;
- evidence-first donor lifecycle and exact-head verification practices.

Gap identified:

- no provider-neutral quota-window snapshot;
- no read-only provider credential reader dedicated to subscription/rate-limit quota;
- no local CLI command for provider-reported remaining quota;
- no freshness/reset semantics for provider quota;
- no explicit auth-state taxonomy for quota adapters.

Therefore this is an integration track, not a standalone product.

## 8. Product thesis and target boundary

**Product thesis:** add a Provider Quota Monitor to Token Intelligence so a developer can see provider-reported remaining subscription/rate-limit capacity next to measured agent usage and cost, without handing provider credentials to Token Intelligence.

Phase A boundary:

- Codex only;
- local execution only;
- read provider-owned OAuth state read-only;
- make the provider request directly from the user's machine;
- return a safe provider-neutral snapshot;
- expose through `ti quota codex [--json]`;
- never upload provider secrets or quota snapshots;
- never refresh, rotate, rewrite, delete, or migrate provider credentials;
- never interpret quota remaining as token savings, spend savings, or budget compliance.

## 9. Behavior contracts and acceptance tests

### Secret boundary

Given valid OAuth credentials, the provider bearer token, raw account ID, refresh token, email, and raw auth document must never appear in:

- `ProviderQuotaSnapshot`;
- formatted CLI output;
- errors returned by the quota module;
- Token Intelligence telemetry.

Only a one-way opaque account reference may leave the adapter.

### Read-only boundary

The adapter may read the provider credential file. It must not write, refresh, rotate, delete, chmod, or otherwise mutate it.

### Auth-state boundary

API-key-only login, absent login, malformed login, rejected OAuth, no allocation, and network/provider failure must produce distinct states.

### Quota normalization

- provider `used_percent` becomes `remainingPercent` without becoming a savings metric;
- values are bounded to 0–100;
- reset-after durations are evaluated relative to fetch time;
- absolute reset timestamps remain absolute;
- unknown values remain `null`, never zero-filled.

### Endpoint instability

Because the observed Codex quota endpoint is provider-internal/undocumented, any schema/network failure must degrade to `unavailable` without changing credentials or fabricating quota.

## 10. Clean-room implementation

Phase A files:

- `src/lib/quota/types.ts` — provider-neutral snapshot/window/auth-state contracts;
- `src/lib/quota/codex.ts` — independently authored Codex local credential reader + quota normalizer;
- `scripts/ti.ts` — `quota codex [--json]` local CLI surface;
- `tests/provider-quota.test.ts` — deterministic privacy, auth-state, reset, and normalization tests.

Implementation intentionally does not depend on donor Rust code and does not reproduce donor UI.

## 11. Independent verification plan

Required before Phase A is called complete:

1. exact-head focused tests pass;
2. TypeScript typecheck passes;
3. ESLint passes for touched code / repository gate as applicable;
4. independent privacy review verifies no provider secret reaches output or telemetry;
5. code review confirms no credential mutation path;
6. exact-head CI evidence is recorded;
7. inherited repository blockers are distinguished from regressions introduced by this slice.

Synthetic fixtures establish contracts but do not certify the live provider endpoint. A bounded local live test using the developer's already-authenticated Codex CLI is a separate certification step and must not expose the token in logs or artifacts.

## 12. Hosted/browser/recovery certification

Not required for the local Phase A CLI itself.

Hosted sync is a later gated phase and requires a new metadata persistence/privacy design. Browser/dashboard certification becomes applicable only when quota snapshots are persisted and rendered in the hosted product. The hosted product must never require provider bearer tokens for this feature.

Recovery cases for later certification:

- provider endpoint disappears or changes shape;
- stale snapshot expires;
- auth is revoked between refreshes;
- quota window resets;
- a provider is temporarily unavailable;
- multiple local accounts are discovered;
- UI refresh fails while background collection succeeds.

## 13. Evidence-backed tracker update

Tracker state must stay `implementation / verification pending` until exact-head validation is available. It must not be marked deployed, production-ready, parity-complete, or savings-verified based on this dossier or synthetic tests alone.

## Phase B / C candidates

After Phase A is independently verified:

- add Claude Code, Cursor, Antigravity, Kiro, Grok, Copilot, and OpenCode Go adapters one at a time with source/credential contracts per provider;
- add local `ti quota all` aggregation;
- add optional local snapshot history;
- design a metadata-only hosted quota snapshot receipt with explicit TTL/freshness;
- render quota windows beside existing measured usage/economics;
- add low-quota alert policies that use remaining quota, not a fake dollar/token conversion;
- evaluate VS Code and tray/menu-bar surfaces only after the core adapter API is stable.

## Non-claims

This work does not claim:

- parity with Quota;
- official support from any AI provider;
- stability of undocumented endpoints;
- token or cost savings from quota monitoring;
- live-provider certification from synthetic fixtures;
- desktop, tray, VS Code, mobile, or hosted parity;
- production readiness until the exact-head verification gates pass.
