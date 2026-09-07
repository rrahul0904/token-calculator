# Developer Acquisition Engine — Wave 1C.3

Date: 2026-09-04  
Status: Implemented on `wave-1c3-developer-acquisition-engine`

## Purpose

Turn the calculator/model economics foundation into a discoverable developer utility without inventing a second pricing, tokenizer, or comparison engine.

Acquisition path:

```
search / direct link
      ↓
model detail or comparison
      ↓
workload economics
      ↓
pricing provenance / history
      ↓
calculator / Cost Lab
      ↓
developer API / SDK
      ↓
optional authenticated workspace
```

## Canonical public routes

- `/models/[modelId]`
- `/models/[modelId]/pricing-history`
- `/compare/[left]/vs/[right]`
- `/developers`
- `/openapi.json`

Model pages are generated from `MODEL_CATALOG`. No page contains duplicated model pricing constants.

## Shared domain helpers

`src/lib/model-discovery.ts` owns:

- model lookup
- current-model filtering
- related/comparable model selection
- deterministic comparison ordering
- represented pricing history
- normalized model API serialization
- curated high-value comparison pairs

`src/lib/comparison-state.ts` owns numeric comparison query parsing/serialization.

Comparison URLs may contain only workload numbers and model IDs. Raw prompt content, source code, API keys and bearer tokens are not part of the route state.

## Comparison canonicalization

Provider order is deterministic:

1. OpenAI
2. Anthropic
3. Google
4. xAI
5. DeepSeek

Within a provider, model ID ordering is deterministic.

Reverse routes redirect to the canonical route so `A vs B` and `B vs A` do not produce duplicate search surfaces.

## Pricing history

Pricing-history pages/API return only pricing windows represented by the catalog.

Unknown historical start dates are displayed as unknown/not represented rather than inferred.

Gemini 3.6/3.7 Flash explicitly represent:

- 2026 introductory pricing through 2026-12-31
- scheduled catalog default beginning 2027-01-01

## Model APIs

Public economics APIs include:

- `POST /api/v1/tokenize`
- `GET /api/v1/models`
- `GET /api/v1/models/[id]`
- `GET /api/v1/models/[id]/pricing-history`
- `POST /api/v1/estimate`
- `POST /api/v1/compare`

Tenant/run/control/gateway endpoints keep their existing authentication requirements.

## SDK onboarding

Repository package names:

- TypeScript: `@token-intelligence/sdk`
- Python: `token-intelligence`

SDK constructors now allow public economics calls without an API key. Authenticated methods still rely on server-side authorization and return the normal unauthorized response if credentials are absent.

The repository does not claim registry publication until a release pipeline publishes those packages.

## SEO/discovery

The sitemap includes:

- current model detail pages
- current model pricing-history pages
- a curated high-value comparison set

The product deliberately does not generate every pairwise model permutation.

Model/provider pages are internally linked so acquisition pages do not become isolated SEO documents.

## Quality

Wave 1C.3 extends the existing privacy/mobile regression contract to model, history and comparison surfaces.
