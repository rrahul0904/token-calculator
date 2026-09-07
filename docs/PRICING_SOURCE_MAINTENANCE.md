# Pricing Source Maintenance

Date: 2026-09-04

## Principle

Official provider documentation is the pricing source of truth. A public reference product may inform workflow parity but does not override an official provider price.

Pricing changes are never auto-applied from an untrusted scrape.

## Source registry

`src/lib/pricing-sources/registry.ts` identifies the official maintenance source for:

- OpenAI
- Anthropic
- Google Gemini
- xAI
- DeepSeek

Current ingestion mode is intentionally `manual_verification`.

## Normalization

`normalizeCatalog(at)` converts the canonical model catalog into deterministic pricing snapshots containing:

- model ID
- provider
- context window
- max output
- currently effective input/cache/output rates
- cache-write rates
- active pricing-version ID
- pricing tier
- source URL
- verification date

Effective pricing is resolved through the existing Wave 1C.2 pricing resolver.

## Diff engine

`diffPricingCatalog(current, candidate)` reports field-level changes.

Material fields include:

- context window
- max output
- input price
- cached-input price
- output price
- cache-write rates
- active pricing version
- pricing tier

Source URL and verification-date changes are reported but are not by themselves classified as material economics changes.

## Maintenance command

```bash
npm run pricing:diff
```

Without a candidate file this performs a deterministic self-check.

To compare a candidate normalized snapshot:

```bash
npm run pricing:diff -- path/to/candidate.json
```

To return a non-zero status for material differences:

```bash
npm run pricing:diff -- path/to/candidate.json --fail-on-change
```

Candidate files must be either:

```json
[ ...normalized models... ]
```

or:

```json
{ "data": [ ...normalized models... ] }
```

## Promotion expiration

A snapshot taken on 2026-12-31 and another on 2027-01-01 will report the effective Gemini 3.6/3.7 Flash transition because the pricing resolver changes both rate and active version.

This is the foundation for a later scheduled GitHub Action. Wave 1C.3 does not automatically crawl providers, mutate the catalog, or open production pricing changes.
