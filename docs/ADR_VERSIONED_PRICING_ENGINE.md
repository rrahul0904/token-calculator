# ADR — Effective-Dated Pricing Engine

Date: 2026-09-04  
Status: Accepted  
Wave: 1C.2

## Context

LLM providers increasingly publish temporary promotional prices, future standard prices, cache-specific rates, and long-context thresholds. A single mutable `pricing` object plus a human-readable label cannot correctly answer historical or future-dated cost questions.

Token Intelligence also needs to preserve pricing provenance when agent usage is reconciled after the fact.

## Decision

Model catalog entries keep a stable fallback `pricing` object and may additionally declare `pricingVersions`.

Each version includes:

- stable version ID
- `effectiveFrom`
- optional inclusive `effectiveTo`
- price buckets
- source URL
- verification date
- optional label/service tier

`resolvePricing({ model, inputTokens, at })` is the canonical resolver.

Resolution order:

1. select the active effective-dated version, if any
2. otherwise use the model fallback price
3. apply the model's data-driven long-context rule when input tokens are strictly greater than its threshold
4. return source, verification date, tier, and version ID together with the effective price

The cost engine accepts an optional execution timestamp so historical receipts can later be priced using the rate effective when the workload ran.

## Boundary semantics

- `effectiveFrom` is inclusive at 00:00:00 UTC
- `effectiveTo` is inclusive through 23:59:59.999 UTC
- long-context thresholds are currently **strictly greater than** the configured threshold because the published catalog labels use `>`
- unavailable cached-input pricing means cache discount is not applied; those tokens remain ordinary billable input

## Current application

Gemini 3.6 Flash and Gemini 3.7 Flash model the temporary 2026 introductory standard-tier rate as an effective-dated pricing version ending 2026-12-31. Their catalog fallback is the standard price effective from 2027-01-01.

Other catalog entries continue using the fallback price until a source provides a trustworthy effective window.

## Consequences

Benefits:

- deterministic historical pricing
- promotion-boundary tests
- pricing provenance travels with calculations
- no date conditionals in React components
- future pricing-history UI can reuse the same domain model

Tradeoffs:

- provider pricing changes require source-backed catalog maintenance
- long-context pricing may eventually need its own version timeline when providers publish temporally different threshold prices
- catalog fallback rates must be maintained carefully

## Non-goal

This ADR does not attempt to reconstruct undocumented historical prices or infer unverified promotion start dates.
