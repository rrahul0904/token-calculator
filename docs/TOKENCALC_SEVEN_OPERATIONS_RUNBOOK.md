# TokenCalc Seven Workload Economics — Operations Runbook

Updated: 2026-09-04

## Purpose

This runbook covers the shareable workload-economics calculator, pricing refresh pipeline, reviewed pricing overrides, persistence, and troubleshooting for the `tokencalc-seven-vibe-implementation` wave.

The public calculator is designed to remain useful even when authentication, PostgreSQL, or provider refresh credentials are not configured.

## Public calculator

Route:

`/tools/cost`

Reference-compatible example:

`/tools/cost?model=glm-5.3-flash&mode=tokens2cost&tokens=1000000000&input=99&cache=98`

Properties:

- no authentication is required
- core workload arithmetic runs in the browser from the bundled reviewed catalog
- URL state contains planning metadata only
- prompt/source text is never placed in the workload URL
- browser reload and back/forward restore normalized scenario state
- unknown price dimensions remain `null` / “Unknown”
- pricing enrichment failure does not prevent basic calculation

The public economics APIs also apply a bounded per-instance anonymous rate limiter. This is defense-in-depth for application instances; horizontally scaled production should additionally use platform/WAF rate limiting if a globally shared anonymous quota is required.

## Pricing model

The canonical relationship is:

```text
Canonical model
  ├─ evidenced direct provider endpoint
  └─ routed endpoint (for example OpenRouter)
```

A model identity is not an inference endpoint identity. The same model can eventually have multiple endpoints with different price, context, region, service tier, latency, throughput, or availability evidence.

## Pricing refresh

Refresh endpoint:

`GET|POST /api/internal/pricing/refresh`

Current scheduled source:

- OpenRouter Models API
- Vercel cron target: approximately every six hours
- server-only credentials

Required for scheduled refresh:

- `DATABASE_URL`
- `CRON_SECRET`
- `OPENROUTER_API_KEY`

The public calculator does not require these values.

Pipeline:

```text
fetch
  -> normalize
  -> validate
  -> reject empty / suspicious / duplicate catalogs
  -> create candidate snapshot
  -> write endpoint/rate rows
  -> publish snapshot
```

Publication is fail-safe:

- published snapshots are immutable
- a candidate is not selected as active until its ingest succeeds
- malformed, empty, duplicate, or suspiciously small upstream data fails the refresh
- a failed refresh leaves the previous published snapshot selected
- the bundled reviewed catalog remains a deterministic fallback when no database snapshot is available

## Pricing provenance

`GET /api/v1/pricing` exposes:

- effective endpoint price
- source
- source URL
- observed/verified time
- latest published snapshot metadata when available
- stale state
- active override metadata when applicable
- whether the response is using the bundled fallback

Do not describe pricing as “live” unless it is actually sourced from a freshly published snapshot. Prefer “observed,” “verified,” or “refreshed.”

## Manual reviewed overrides

Endpoint:

`POST /api/internal/pricing/override`

Required:

- `DATABASE_URL`
- `PRICING_ADMIN_SECRET`

Example shape:

```json
{
  "endpointId": "openrouter:z-ai/glm-5.3-flash",
  "values": {
    "input": 0.075,
    "cachedInput": 0.015,
    "output": 0.25
  },
  "reason": "Reviewed against provider/router source",
  "expiresAt": "2026-09-05T20:00:00.000Z"
}
```

Rules:

- operator authorization is mandatory
- endpoint must already exist
- a reason is mandatory
- negative values are rejected
- explicit `null` means unknown and does not silently fall back to the snapshot price
- expiry is supported
- expired overrides are ignored
- the original snapshot is never modified
- the override record remains available for audit/review history

Do not put `PRICING_ADMIN_SECRET` in client code or documentation examples.

## Investigating stale or unexpected pricing

1. Call `GET /api/v1/pricing?modelId=<model>`.
2. Check `source`: `published_snapshot` or `bundled`.
3. Inspect `latestPublishedSnapshot`.
4. Check each endpoint's source URL and observed date.
5. Check `stale`.
6. Check whether an `override` is active.
7. If the database has no published snapshot, inspect the pricing-refresh job.
8. Compare the candidate source data before creating an override.

## Database migration

Current workload/pricing migration:

`drizzle/0003_workload_pricing_intelligence.sql`

Adds:

- `inference_endpoints`
- `pricing_snapshots`
- `pricing_rates`
- `pricing_overrides`
- `scenario_versions`

Release verification:

```bash
npm run db:check
npm run db:migrate
npm run db:verify
TOKEN_INTELLIGENCE_INTEGRATION_TESTS=1 npm run test:integration
```

The migration is still on the feature branch and has not been merged into `main`. If it is shipped and later needs correction, add a new migration rather than rewriting shipped history.

## Saved scenarios

A public workload can be opened in `/app/cost-lab` and saved when authentication/database configuration is available.

On save:

- prompt text is not persisted by the workload handoff
- the server re-parses workload assumptions
- the server recalculates the result
- version 1 is immutable
- the latest published pricing snapshot ID is attached when available
- if no snapshot exists, the reference remains `null`; no fake snapshot ID is created

Editing/version increment beyond version 1 is not implemented in this wave and must not be implied.

## Planned vs actual reconciliation

Endpoint:

`GET /api/v1/scenarios/:id/variance?runId=<run>`

Cost source priority:

1. reconciled cost
2. provider/agent measured actual cost
3. estimated cost
4. unknown

Variance drivers include token buckets, reasoning tokens, retries, fallbacks, turns, and total cost.

The service intentionally does not fabricate per-driver dollar attribution when call-level pricing evidence is insufficient.

## Advisory controls

Scenario-derived budget/policy/gateway output is advisory only:

- `authoritative = false`
- `requiresOutcomeVerification = true`
- `enforcement = advisory_only`
- `autoRoute = false`

The workload planner does not automatically change production budgets, policies, or model routing.

## Troubleshooting

### `DATABASE_NOT_CONFIGURED`

Expected for persistence/internal pricing APIs when `DATABASE_URL` is absent. The public browser calculator should still work.

### `OPENROUTER_API_KEY_NOT_CONFIGURED`

Scheduled OpenRouter refresh cannot run. Existing published or bundled pricing remains usable.

### `PRICING_ADMIN_NOT_CONFIGURED`

Manual overrides are disabled until the server-only operator secret is configured.

### `OPENROUTER_EMPTY_CATALOG`

Reject the candidate. Do not publish an empty snapshot.

### `OPENROUTER_DUPLICATE_MODEL_ID`

Reject the candidate because upstream identity is ambiguous.

### `OPENROUTER_SUSPICIOUSLY_SMALL_CATALOG`

The source returned fewer rows than the refresh safety floor. Preserve last-known-good pricing and investigate the source/authentication response.

### Unknown price in calculator

This is intentional when the chosen workload uses a pricing dimension the provider/endpoint does not publish. Do not convert it to zero.

## Release gate

Do not declare this wave production-ready until GitHub Actions proves all repository gates:

- secret scan
- lint
- typecheck
- unit tests
- Drizzle schema check
- disposable-Postgres migration
- schema verification
- integration tests
- TypeScript SDK build
- Python SDK import
- CLI smoke
- production build
- application startup
- API smoke
- Playwright production smoke
