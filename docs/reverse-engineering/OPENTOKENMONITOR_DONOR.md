# OpenTokenMonitor → Token Intelligence donor dossier

Status: donor evidence captured; Phase B/C implementation and verification in progress  
Tracking: #62  
Implementation PR: #63  
Intake: https://www.reddit.com/r/coolgithubprojects/comments/1x00nor/opentoken_monitor_see_your_claude_code_codex_and/  
Canonical donor: https://github.com/Hitheshkaranth/OpenTokenMonitor  
Captured: 2026-10-07

## 1. Source identification

OpenTokenMonitor is an MIT-licensed, local-first Rust/Tauri desktop monitor for AI coding-tool usage. The current public product presents Claude Code, Codex and Antigravity together and combines local CLI/log evidence with optional provider-native quota fetches.

Evidence classes used here:

| Claim class | Evidence class | Source |
| --- | --- | --- |
| Product purpose, supported surfaces, privacy claims | first-party-public | donor README and author Reddit posts |
| Architecture, storage, provider boundaries, resilience behavior | official-source / first-party-public | donor repository architecture/README |
| Release behavior and recent resilience changes | first-party-public | donor GitHub releases |
| User needs and requested improvements | community | Reddit feedback threads |
| Competitive surface | first-party-public | public competitor repositories |

This dossier is an evidence source. Token Intelligence does not copy donor branding, UI, source files, fixtures, installers, OAuth material, or provider-specific credential handling.

## 2. Evidence collection

Verified public donor capabilities include:

- unified quota/usage monitoring across multiple coding agents;
- local CLI/log scanning for usage history;
- optional direct provider OAuth/API quota fetches;
- local SQLite persistence;
- per-provider health and degraded/stale behavior;
- per-project/session aggregation and cost attribution;
- burn-rate / exhaustion forecasting;
- threshold notifications;
- compact desktop/tray surfaces;
- explicit exact/approximate/percent-only data presentation depending on evidence quality;
- no hosted account requirement for the local app;
- cross-platform Tauri/Rust/React/TypeScript implementation.

The donor architecture separates two materially different inputs:

1. **usage scanners** — local filesystem/CLI artifacts normalized into usage records;
2. **quota adapters** — provider-native live quota snapshots normalized into provider-neutral state.

This distinction is important for Token Intelligence. Local observed usage and provider-reported subscription capacity are separate evidence classes and must never be conflated.

## 3. Product / user workflow reconstruction

### Provider quota workflow

1. Discover an already-authenticated provider session locally.
2. Read credentials only on the user's device.
3. Call the provider endpoint directly from the local runtime.
4. Normalize provider-specific windows into a common quota snapshot.
5. Store or retain a last-known-good snapshot locally.
6. Mark stale/degraded state when refresh fails instead of removing the provider.
7. Derive burn/exhaustion state only from sufficiently fresh evidence.
8. Alert before exhaustion when a threshold or forecast rule is crossed.

### Local usage workflow

1. Discover provider-owned CLI/log files.
2. Scan incrementally from a checkpoint/cursor.
3. Normalize newly observed records.
4. Deduplicate by a stable record identity.
5. Persist normalized records locally.
6. Roll records up into project/session/model/cost views.
7. Never advance the cursor through an unexpected parse failure unless the record is intentionally classified as skippable.

### Recovery workflow

1. A provider refresh or parser fails.
2. Other providers continue independently.
3. The last-known-good value remains visible.
4. UI/state is marked stale or degraded.
5. A later successful refresh replaces the degraded state.
6. Alert state survives refresh/restart sufficiently to avoid notification spam.

## 4. Capability and failure-mode decomposition

Capabilities worth adopting as contracts rather than UI features:

- scanner/adapter separation;
- provider-neutral snapshot normalization;
- explicit source and freshness semantics;
- last-known-good retention;
- provider failure isolation;
- reset-aware burn-rate forecasting;
- stable usage-record identity and idempotent ingestion;
- persisted/deterministic alert dedupe;
- hysteresis / recovery-based alert rearming;
- testable stale/degraded/error states.

Failure modes to test explicitly:

- provider endpoint unavailable;
- OAuth session rejected or expired;
- provider returns no numeric allocation;
- quota schema changes;
- local log truncation/rotation;
- malformed log line;
- duplicate scan after restart;
- cursor advances without durable record write;
- counter increases because a provider window reset;
- reset timestamp changes between observations;
- stale data produces an apparently precise forecast;
- one provider failure blanks a multi-provider view;
- repeated refreshes spam identical alerts;
- process restart re-fires every previously acknowledged warning;
- clock skew makes a reset/exhaustion timestamp nonsensical.

## 5. User feedback and pain-point analysis

Public feedback reinforces the product problem rather than only the donor UI:

- developers dislike switching between provider dashboards to understand remaining capacity;
- users value the local-first approach for privacy;
- users want estimated daily burn / exhaustion timing, not only a static percentage;
- users want project/model cost attribution so they can identify expensive work;
- users asked for budget/threshold alerts before an unexpected limit or bill;
- simplicity and always-visible status are repeatedly praised;
- broad provider support is a recurring request.

The original October 7 coolgithubprojects intake emphasizes the acute workflow: running out of a rolling/weekly quota mid-task without warning. That makes **forecast correctness and alert quality** the differentiator, not another circular usage gauge.

## 6. Competitive comparison

| Product | Useful evidence | Token Intelligence boundary |
| --- | --- | --- |
| OpenTokenMonitor | local scanners + live quota adapters, LKG/degraded state, burn forecast, project/session cost | donor for Phase B/C/D contracts; do not clone desktop shell |
| Quota (`pinkpixel-dev/quota`) | broad provider quota normalization and auth-state taxonomy | original donor for Phase A provider snapshot foundation |
| `Javis603/token-monitor` | very broad tool coverage and multi-device aggregation | benchmark future adapter coverage; do not widen scope before core contracts stabilize |
| UsageBar (`vineellabs/usagebar`) | backoff and last-good retention under provider 429s | benchmark refresh resilience/rate-limit behavior |

The combined donor lesson is that quota monitoring is a **state-quality problem**: source, freshness, reset boundaries, backoff and failure isolation matter as much as numeric remaining percentage.

## 7. Existing internal donor/project audit

Already present on the #63 branch before this donor extension:

- provider-neutral `ProviderQuotaSnapshot` and quota-window types;
- explicit provider auth states;
- a read-only Codex OAuth quota adapter;
- opaque account-reference hashing;
- secret-boundary tests;
- safe handling of missing, malformed, API-key-only, expired and unavailable provider state;
- `ti quota codex` CLI integration;
- dedicated quota-monitor CI workflow.

Therefore OpenTokenMonitor should **extend #62/#63**, not create another reverse-engineered product or parallel provider-quota subsystem.

## 8. Product thesis and target boundary

**Product thesis:** Token Intelligence should combine measured local agent usage with provider-reported remaining quota and evidence-quality metadata so it can answer three actionable questions safely:

1. How much provider capacity remains?
2. At the current observed burn, are we likely to exhaust it before reset?
3. Which project/session/model is consuming the measured usage/cost?

Current clean-room target boundary:

- retain the existing web/CLI Token Intelligence product;
- no Tauri clone is required for this donor;
- provider OAuth remains local/read-only;
- quota-derived forecasts are advisory and evidence-qualified;
- no quota percentage is converted into invented token or dollar savings;
- no provider credential is uploaded or persisted by hosted Token Intelligence;
- local-log ingestion, if added, uses explicit stable IDs/cursors and privacy filtering.

## 9. Behavior contracts and acceptance tests

### Freshness

- a snapshot older than the configured freshness TTL is `stale`;
- stale snapshots may remain visible but must not drive a fresh-looking forecast or alert;
- a failed latest fetch may fall back to the last numeric snapshot only if the fallback is marked degraded and retains its real age.

### Forecast

- burn is calculated only across observations from the same provider/window/reset boundary;
- an increase in remaining percentage is treated as recovery/reset evidence, not negative burn;
- a changed reset boundary invalidates the prior burn sample;
- insufficient sample span yields no forecast;
- exhaustion is compared with reset time when reset time is known;
- unknown reset produces `null` reset-relative confidence rather than a fabricated boolean.

### Alerts

- a threshold/forecast condition fires once;
- the same persistent condition does not fire every refresh;
- recovery above threshold plus hysteresis rearms the alert;
- a provider reset-window change rearms the alert;
- stale data does not alert;
- alert fingerprints contain no provider credential or raw account identity.

### Local usage ingestion (next slice)

- every normalized record has a deterministic dedupe identity;
- a restart/re-scan cannot double-count a record;
- cursor advancement and durable write are atomic from the consumer's perspective;
- parser failure does not silently skip unknown input;
- file rotation/truncation is detected and recovered explicitly.

## 10. Implementation slices

### Phase A — provider adapter foundation

Status: implemented on #63 before this donor extension; verification remains evidence-gated.

- normalized quota snapshot/window/auth states;
- Codex local read-only adapter;
- safe CLI formatting and JSON;
- deterministic secret-boundary tests.

### Phase B — freshness and forecast primitives

Status: implementation added to #63 on 2026-10-07.

- quota freshness classification;
- last-known-good resolution with explicit degraded state;
- reset-aware burn-rate calculation;
- reset-aware exhaustion estimate;
- forecast confidence based on observed sample span;
- fail-closed forecast suppression for stale/increasing/reset-changed data.

### Phase C — alert decision contract

Status: implementation added to #63 on 2026-10-07.

- low-remaining threshold decision;
- forecast-before-reset decision;
- deterministic condition fingerprint;
- persistent-condition dedupe;
- recovery hysteresis;
- reset-window rearming;
- stale-state suppression.

This phase currently defines the pure decision contract. Durable storage/native notifications are later integration work and must not be claimed yet.

### Phase D — local project/session usage ingestion

Status: not implemented from this donor yet.

Before implementation, audit existing Token Intelligence local-session collectors to avoid a second ingestion plane. Reuse existing run/turn/tool receipts where they already provide stable attribution. Add only missing checkpoint/dedup contracts.

## 11. Independent verification

Required evidence before Phase B/C is complete:

1. exact-head lint for `src/lib/quota` plus quota tests;
2. repository TypeScript typecheck;
3. deterministic provider quota + derived-state Vitest suite;
4. CLI help smoke test;
5. independent review of stale/reset edge cases;
6. exact-head GitHub Actions result attached to #63;
7. no new credential persistence/network behavior introduced by the pure derived-state module.

Synthetic tests verify contracts, not live provider stability.

## 12. Hosted/browser/recovery certification

The new Phase B/C code is pure local domain logic and does not itself add a hosted/browser surface. Hosted certification remains deferred until quota snapshots are deliberately represented in the web product.

Before that later phase can ship:

- define metadata-only snapshot persistence and TTL;
- prove provider bearer tokens never cross the hosted boundary;
- render stale/degraded/error independently per provider;
- verify reset countdown and forecast display under clock skew;
- verify one failed provider cannot blank the aggregate view;
- verify alert dedupe across the chosen persistence/restart boundary.

## 13. Tracker state / non-claims

Evidence-backed state after this donor intake:

- donor identified: **yes**;
- source/evidence collected: **yes**;
- workflow/capability/failure reconstruction: **yes**;
- feedback/competitive/internal audit: **yes**;
- behavior contracts: **yes**;
- Phase B/C pure implementation: **added, exact-head CI pending**;
- durable alert persistence/native notifications: **not yet implemented**;
- local project/session scanner extension: **not yet implemented from this donor**;
- hosted UI certification: **not applicable yet**;
- deployment/production readiness: **not claimed**;
- parity with OpenTokenMonitor: **not claimed**;
- token/cost savings caused by monitoring: **not claimed**.

The project tracker must advance only after exact-head verification evidence, not because files exist on the branch.
