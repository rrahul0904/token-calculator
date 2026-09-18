# Local AI usage intelligence — Optimaizr clean-room reverse-engineering dossier

Reviewed source: **https://www.optimaizr.com/** and its public privacy page on **2026-09-16**.

This dossier records publicly observable product behavior and maps it into Token Intelligence. It does not copy proprietary source code, private implementation details, branding, prose, thresholds, or undisclosed algorithms. Public behavior is used only to identify product capabilities that Token Intelligence can implement independently with its existing telemetry, pricing, findings, experiment, gateway, and privacy architecture.

## Product thesis

The reference product is not primarily a token counter. Its primary user promise is **recoverable AI spend backed by evidence**:

1. read local or imported usage;
2. identify waste patterns;
3. attach explicit arithmetic and confidence to each finding;
4. avoid double-counting overlapping findings;
5. recommend a concrete change;
6. verify risky routing changes against the user's own traffic and quality bar before adoption;
7. keep a record of savings after a change ships.

That thesis aligns strongly with Token Intelligence's existing Agent Economics / AI FinOps direction. Token Intelligence already has a broader control plane, so the clean-room goal is to make the local workflow a first-class entry point into that platform rather than clone the reference product's UI or wording.

## Publicly observable surface

### Local-first onboarding

The public experience is intentionally low-friction:

- install a CLI;
- no account required for the local product;
- run a local scan/audit immediately;
- no prompt text leaves the machine by default;
- the local engine is presented as free and MIT-licensed.

Token Intelligence should preserve the same *class* of low-friction workflow without copying branding:

```bash
npm run ti -- audit codex /path/to/session.jsonl
```

No Token Intelligence API key is required for the current local audit path.

### Inputs

The reference product publicly describes three input classes:

- coding-agent transcripts / histories;
- CSV or JSON usage exports;
- an SDK wrapper for direct application traffic.

Token Intelligence already has local collectors for Codex, Claude, Cursor, and Antigravity plus normalized telemetry ingestion. Missing parity is primarily **input orchestration**: auto-discovery across local history trees and generic import adapters for provider/export files.

### Core audit output

The public output centers on:

- observed/projected spend;
- recoverable spend;
- waste share;
- top reasons ranked by financial impact;
- a confidence label per reason;
- an evidence-basis label per number;
- annualized opportunity;
- explicit disclosure when findings overlap.

The reference product explicitly avoids presenting overlapping rule outputs as a naively additive total. That matches Token Intelligence's current `additiveSavingsClaimed: false` behavior and should remain a hard invariant.

### Waste patterns publicly demonstrated

The reference surface publicly demonstrates findings in these families:

| Public behavior | Token Intelligence clean-room mapping | Current state |
| --- | --- | --- |
| repeated reads / redundant calls | `repeated-resource-read`, `tool-retry-loop`, `same-resource-edit-churn` | implemented |
| oversized tool output | `oversized-tool-output` | implemented |
| unnecessary context / context growth | `orientation-heavy`, `excessive-context-growth` | implemented |
| cache-defeating behavior | `cache-blind-spot` | implemented |
| expensive fallback behavior | `fallback-premium` | implemented |
| over-specified model | `oversized-model-route` with comparable successful-run / experiment evidence | implemented but evidence-gated |
| heavy reasoning usage | `reasoning-review-candidate` | implemented as benchmark-only signal |
| whole-resource inclusion where a slice would do | requires collector-safe size/range metadata; do not inspect source contents | partial |
| repeated prompt-prefix churn | can use privacy-safe hashes / cache metadata where collectors expose it | planned |
| spend attribution by project / route | existing Token Intelligence project/run model | platform exists |

Token Intelligence intentionally refuses two weaker inferences that a local optimizer might otherwise make:

1. an expensive model is **not** automatically labelled over-specified;
2. high reasoning usage is **not** proof that a task was simple.

Both require outcome or experiment evidence before a cheaper default can be treated as a validated optimization.

## Evidence semantics

A key differentiator in the public reference is that every number declares *how it is known*.

The reference distinguishes concepts equivalent to:

- **measured** — directly observed/provider-reported usage;
- **inferred** — a pattern derived from observed metadata by a stated rule;
- **estimated** — a counterfactual or modelled value such as expected cost on another route.

Token Intelligence already carries confidence/evidence distinctions across findings and route experiments. The local product should standardize them into one shared contract rather than allow each CLI command or UI to invent its own labels.

### Proposed Token Intelligence evidence contract

Every local recommendation should expose:

```ts
{
  basis: "measured" | "inferred" | "estimated" | "experiment_verified",
  confidence: "high" | "medium" | "low",
  arithmetic: {
    observed?: number,
    counterfactual?: number,
    delta?: number,
    unit: "tokens" | "usd" | "latency_ms" | "requests"
  },
  overlapGroupIds: string[],
  verificationRequired: boolean
}
```

This is a target contract for later normalization; the current finding types should not be force-fit until the migration can be done without breaking existing API behavior.

## Recommendation lifecycle

The public reference presents a clear progression from observation to action:

1. inspect spend;
2. inspect waste;
3. explain why a finding fired;
4. rank recommended changes;
5. simulate a change;
6. verify the change against real traffic / a quality bar;
7. apply only after verification.

Token Intelligence already has the deeper platform primitives for this lifecycle:

- normalized run receipts;
- outcome attribution;
- experiment datasets/cases/results;
- verified-savings gates;
- policy authoring and approvals;
- gateway/budget controls.

The missing work is to connect the local audit experience to those existing primitives with a coherent command and web workflow.

## Public CLI behavior map

The reference product publicly exposes sixteen command families. Token Intelligence should map the *capabilities*, not necessarily the names.

| Capability | Reference behavior | Token Intelligence status / target |
| --- | --- | --- |
| audit | spend + recoverable opportunity | `ti audit` implemented |
| scan | spend, savings, action summary | fold into multi-session local scan |
| waste | opportunities only | filtered local audit view |
| tokens | token analytics / priciest calls | existing telemetry; local view pending |
| why | drill into spend drivers | findings evidence drill-down pending |
| show rule | list affected requests | privacy-safe affected-run view pending |
| guide | model/job guidance | model catalog + route evidence exists; local UX pending |
| recommend | ranked actions | current audit recommendations implemented, richer ranking pending |
| simulate | counterfactual cost | cost engine exists; local audit integration pending |
| verify | replay/evaluate before switch | experiment engine exists; local workflow pending |
| apply | emit exact change after verification | policy/gateway exists; local patch/action UX pending |
| import | CSV/JSON usage import | generic local import pending |
| report | shareable local report | structured human/JSON exists; HTML artifact pending |
| providers | supported sources | collector registry exists; richer CLI surface pending |
| privacy | explain local data handling | implementation metadata exists; CLI command pending |
| metrics | analyzed volume / savings found | local multi-session rollups pending |

## Privacy model

### Current local Token Intelligence boundary

The implemented local audit consumes normalized collector output and does not inspect or persist prompt text, source code, transcript text, or raw tool output.

The report records:

- `localOnly: true`
- `contentStored: false`
- `rawPromptContentInspected: false`
- `networkRequestsRequired: false`

This is intentionally conservative and should remain the default.

### Hosted reference behaviors worth carrying forward carefully

The public reference describes a hosted model in which usage rows can contain model/provider, timestamp, latency, input/output/cache/reasoning token counts, cost, project/route, prompt hash/length, tool counts, and stop reason while prompt text stays off by default. Optional prompt capture is described as separately stored, redacted, encrypted, expiring, and deletable.

Token Intelligence already has platform-level privacy/security controls. Any future prompt-capture capability must remain **explicit opt-in** and must not be required for basic audit, spend, cache, retry, routing, or token analytics.

## Hosted / continuous layer

The public reference says its hosted dashboard is not yet generally open and describes a future continuous layer with:

- continuous ingestion;
- daily rollups;
- scheduled re-verification;
- long-lived history;
- routing rules / possible auto-apply;
- spend guardrails;
- project-level splits.

Token Intelligence already has most of the architecture needed for this class of product: persistent telemetry, budgets, policy/gateway enforcement, experiments, rollups, projects, provider usage imports, and an authenticated workspace. The local feature should therefore feed the existing platform instead of creating a parallel hosted subsystem.

## Architecture hypothesis for the reference workflow

A clean-room implementation can be explained as five independent layers without assuming any private code:

1. **Collectors/importers** — parse local agent histories, CSV/JSON exports, or SDK events into a normalized call/run schema.
2. **Cost normalizer** — resolve provider/model pricing and classify each value as observed vs calculated.
3. **Waste rules** — deterministic pattern detectors over normalized metadata.
4. **Overlap engine** — group findings touching the same calls/resources so recoverable spend is not double-counted.
5. **Verification engine** — run a controlled counterfactual/evaluation before a risky route/config change is promoted.

Token Intelligence already has layers 1–3 in production-grade form and a stronger experiment/control-plane foundation for layer 5. The largest parity gap is local orchestration plus overlap-aware aggregation across many sessions.

## Current implemented slice in PR #18

### CLI

```bash
npm run ti -- audit codex /path/to/session.jsonl
npm run ti -- audit claude /path/to/session.jsonl --since 7d
npm run ti -- audit antigravity /path/to/session.jsonl --json
```

`audit` parses the provider trace locally, runs the Token Intelligence findings engine, adds a conservative reasoning-effort benchmark signal, and prints either a human report or JSON.

The command does not require a Token Intelligence API key and does not invoke the ingestion API.

### Current truthfulness invariants

- no generic model-downsizing claim;
- no inference that a private task was simple;
- no additive headline savings total when findings overlap;
- fixture-based provider-format tests are not described as real-user telemetry;
- unknown cost is not converted to `$0`;
- estimated values are not described as measured;
- a routing recommendation is not treated as verified until equivalent-or-better outcome evidence exists.

## Gap analysis and implementation waves

### Wave O1 — local multi-session intelligence

Highest-value next slice:

- auto-discover supported local history files;
- recursively scan many sessions;
- deduplicate sessions/events;
- aggregate day/week/month windows;
- group repeated findings across runs;
- retain overlap-safe opportunity accounting;
- show priciest runs/models/projects and token mix;
- support `--project`, `--source`, `--days`, `--json` consistently.

Acceptance boundary: entirely local, no API key, no network dependency, no prompt text inspection.

### Wave O2 — import + report

- generic CSV/JSON usage import schema;
- versioned local audit snapshot file;
- local HTML report;
- before/after comparison between snapshots;
- savings ledger that records only verified or user-confirmed shipped changes;
- provenance for observed vs inferred vs estimated metrics.

### Wave O3 — explain / simulate / verify

- evidence drill-down from a recommendation to affected runs/calls;
- model/pricing counterfactual simulation;
- bind a recommendation to a versioned evaluation dataset;
- execute existing experiment engine locally or through an explicitly authenticated provider path;
- withdraw a route recommendation when the candidate fails the quality bar;
- promote verified savings into the existing Token Intelligence control plane.

### Wave O4 — hosted continuity

After the release-candidate infrastructure is production-certified:

- ingest local audit snapshots intentionally, not automatically;
- daily/weekly/monthly rollups;
- anomaly/spike detection;
- scheduled re-verification because traffic and model behavior change;
- project/team splits;
- budgets and gateway policy actions;
- longitudinal verified-savings history.

## What not to copy

The following are intentionally outside clean-room parity:

- the reference product's name, logo, visual design, marketing language, exact report prose, and example datasets;
- unknown proprietary thresholds or ranking formulas;
- private source code or package internals;
- undocumented provider integrations;
- any claim of equivalent security certifications, install base, or performance without our own evidence.

## Certification target

For every incremental slice, repository certification should prove the exact commit through the existing CI matrix. Local-audit-specific gates should include:

- TypeScript typecheck;
- unit tests;
- production build;
- CLI help/smoke;
- privacy metadata assertions;
- no API key required for local analysis;
- fail-closed evidence semantics;
- overlap-safe opportunity logic;
- provider-format fixture coverage.

A test fixture proves deterministic parser/engine behavior. It does **not** prove compatibility with arbitrary real user histories. Real-provider traces should only be cited when an actual trace was explicitly available and exercised.

## Immediate next implementation target

Continue on **PR #18 / `feat/local-usage-audit`** rather than creating a duplicate branch. The next bounded implementation should be **Wave O1 local multi-session scanning and rollups** while preserving the frozen `release-candidate-full-site` branch. The broader hosted/release work must remain separate from this local parity stream until its external production gates are satisfied.
