# Pricing Source Architecture

Updated: 2026-09-04

## Design goal

Token Intelligence separates **what a model is** from **where that model is served** and **which pricing observation was used for a calculation**.

```text
CanonicalModel
      |
      +-- evidenced direct endpoint
      |
      +-- routed endpoint
      |
      +-- future endpoint
```

A canonical model may be offered by multiple inference providers. Those offerings can vary in pricing, cache semantics, context, region, service tier, availability, latency, throughput, and uptime. Therefore one mutable price attached directly to a model is not a sufficient long-term data model.

## Current source layers

### Bundled reviewed catalog

The repository's reviewed model catalog is the deterministic browser fallback.

It provides:

- canonical model identity
- reviewed direct-provider pricing where first-party evidence exists
- the current routed GLM 5.3 Flash pricing reference
- source URL
- verification date
- context and output limits where modeled

The bundled catalog lets the public calculator remain available without a database or upstream request.

### OpenRouter refresh adapter

The server adapter consumes the allowlisted OpenRouter Models API and normalizes:

- external model ID
- canonical model slug
- context window
- maximum completion tokens where published
- prompt/input price
- cached-input read price
- cache-write price
- output/completion price
- source URL
- observed timestamp

Per-token source prices are normalized into dollars per million tokens.

Blank, malformed, negative, empty, duplicate, and suspiciously incomplete candidate data is rejected rather than converted into plausible-looking zero prices.

### Reviewed direct-provider normalization

Existing first-party reviewed catalog entries are exposed through the same endpoint abstraction.

A provider route is not created merely because a canonical model vendor exists. In particular, the GLM record does not fabricate a direct Z.AI endpoint when the evidence in this wave only supports the routed OpenRouter offering.

## Persistence

```text
PricingSource
      |
      v
Candidate snapshot
      |
      v
Normalization + validation
      |
      +---- failure ----> keep previous published snapshot
      |
      v
Immutable PricingSnapshot
      |
      v
PricingRate rows
      |
      v
Reviewed override (optional, expiring)
      |
      v
Effective pricing API
```

### `pricing_snapshots`

Stores source, status, payload hash, row count, fetched time, published time, error metadata, and source metadata.

### `inference_endpoints`

Stores canonical model ID separately from inference provider/external model ID.

### `pricing_rates`

Stores nullable numeric price dimensions with source URL and observed time.

### `pricing_overrides`

Stores explicit reviewed changes, reason, optional expiry, and timestamps. Overrides never rewrite the snapshot.

### Effective pricing

`GET /api/v1/pricing` selects the latest successfully published snapshot when available, applies only active reviewed overrides, and otherwise falls back to the bundled reviewed catalog.

## Unknown-price semantics

Unknown is a first-class state.

If a workload consumes non-zero tokens in a pricing bucket for which the selected model/endpoint has no published rate, that component is unknown and aggregate cost is unknown.

Examples:

- missing cache-read price with non-zero cached-read tokens
- missing cache-write price with non-zero cache-write tokens

Zero tokens in an unsupported bucket cost zero because the missing rate is not used.

## Model quality and performance evidence

Pricing identity is separate from quality/performance evidence.

This wave does not fabricate:

- quality equivalence
- benchmark scores
- endpoint latency
- throughput
- uptime

The Pareto/frontier engine accepts cost-quality points only when an explicit quality score includes a source URL and benchmark metadata. Automated quality-evidence ingestion is a later wave.
