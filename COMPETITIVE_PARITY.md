# Competitive parity wave — Token-Calculator.net

Reference reviewed: https://token-calculator.net/
Review date: 2026-09-04

This implementation reproduces useful observable product behaviors independently. It does not copy proprietary source, visual assets, branding, copywriting, or undisclosed implementation details.

## Observable reference capabilities reviewed

### Main calculator
- local text tokenization and token visualization
- token, word, no-space character, and total character counts
- input / cached-read / output cost estimates
- context-window visibility
- full multi-model pricing table
- automatic long-context pricing tiers
- provider-specific model guides
- theme toggle

### Planning tools
- token-to-word conversion
- token cost calculator
- GPU RAM / VRAM planning calculator
- tokens-per-second / streaming simulator
- tokenization education / guidance

### Developer product
- POST token-counting API
- bearer API-key concept
- API documentation
- API dashboard concept
- text processed for response without storing submitted prompt text
- paid monthly/yearly API-access subscriptions

### Commercial / discovery surface
- pricing page
- use-case content for prompts, documents, code, JSON, and chat
- provider-specific OpenAI / Claude / Gemini cost pages
- FAQ and educational SEO pages

## Added in this wave

- no-space character count in the main worker and UI
- expanded official-source model catalog beyond the reference provider set
- data-driven automatic long-context pricing shared by all calculators
- searchable full model pricing page
- dedicated Cost Lab with workload presets and model ranking
- tokens-to-words and words-to-tokens planning ranges
- GPU model-memory calculator
- streaming speed simulator that separates TTFT from decode time
- public-beta POST `/api/v1/tokenize` endpoint with a 500 KB request cap and `no-store` responses
- developer API documentation page
- dark/light theme toggle
- product navigation and planning-tool directory
- subscription packaging page for Free / Pro / Team / Enterprise
- sitemap coverage for the new application routes

## Deliberate differences / improvements

- Token Intelligence includes xAI and DeepSeek in addition to the providers emphasized by the reference.
- Pricing is modeled from current official provider sources rather than blindly copying third-party rates.
- OpenAI `o200k_base` is labeled as a planning reference rather than implying undocumented exact model-tokenizer equivalence.
- Long-context pricing lives in the model schema and is shared by all calculators instead of being page-specific math.
- The speed tool separates time-to-first-token from decode time.
- The subscription page defines SaaS/enterprise product boundaries but does not fake a checkout before billing is connected.
- Browser tokenization remains local-first; the developer API has an explicit separate privacy boundary.
- The product direction is broader than a calculator: Cost Lab, model economics, developer integrations, organization controls, and enterprise AI FinOps.

## Verified build surface

The latest Vercel parity preview completed a clean Next.js 16.3.3 production build with TypeScript validation and generated 13 application routes:

- `/`
- `/api/v1/tokenize`
- `/developers`
- `/models`
- `/pricing`
- `/robots.txt`
- `/sitemap.xml`
- `/tools/cost`
- `/tools/memory`
- `/tools/speed`
- `/tools/tokens-words`
- framework not-found route
- application shell/static assets

## Deferred to the SaaS / enterprise wave

These require durable identity/billing infrastructure and should not be simulated with fake UI:

- authentication
- durable user accounts and organizations
- real paid checkout and billing webhooks
- self-serve API key creation/revocation
- hashed API-key storage
- metered quotas and usage records
- subscription entitlement enforcement
- customer billing portal
- MCP server and OAuth
- Codex / Claude Code / Cursor / Antigravity integrations
- organization budgets and alerts
- RBAC
- SSO / SCIM
- audit logs / SIEM exports
- AI gateway enforcement and provider routing


## 2026-09-04 live refresh

The latest clean-room audit is recorded in [`docs/LIVE_REFERENCE_AUDIT_2026-09-04.md`](./docs/LIVE_REFERENCE_AUDIT_2026-09-04.md).

### Newly implemented

| Capability | Reference | Token Intelligence | Decision |
| --- | --- | --- | --- |
| Provider-specific OpenAI guide | Yes | `/guides/openai` | Added independently |
| Provider-specific Anthropic guide | Yes | `/guides/anthropic` | Added independently |
| Provider-specific Gemini guide | Yes | `/guides/gemini` | Added independently |
| Interactive provider workload/monthly estimate | Yes | Yes | Added using shared cost engine |
| Public sitemap for calculator/tools/guides | Public discovery surface | `/sitemap.xml` | Added |
| Prompt network-leak regression | Not observable | Playwright test | Improvement |
| GPT-5.5 Pro | Yes | Yes | Added from official OpenAI docs |
| Claude Fable/Mythos 5.1 | Not in audited main table | Yes | Deliberate freshness improvement |
| Gemini 3.7 Flash | Not in audited main table | Yes | Deliberate freshness improvement |

### Deliberate pricing differences

The reference product is not used as the final pricing authority. Where its table differs from current official provider documentation, Token Intelligence uses the official source.

- GPT-5.6 Sol remains $4 input / $0.40 cached input / $20 output per 1M from OpenAI documentation, even though the audited reference table displayed $5 / $0.50 / $30.
- Gemini 3.6/3.7 Flash use Google's currently effective introductory $0.75 input / $0.075 cached input / $3.75 output rate through 2026-12-31 rather than the later $1.50 / $0.15 / $7.50 list rate.

This is an intentional product-quality improvement, not a parity defect.

## Wave 1C.2 hardening differences

Token Intelligence intentionally goes beyond the observed reference in several areas:

- tokenizer certainty is a first-class domain value rather than an implicit provider label
- share links preserve workload assumptions without including prompt content
- pricing can be resolved by execution date with explicit version/provenance metadata
- unavailable cache pricing is not treated as a zero-cost cache bucket
- token-piece output is explicitly bounded for UI/API responsiveness
- the tokenize API remains compatible with the basic `{ "text": ... }` contract while optionally accepting a model and bounded piece output
- context headroom is calculated against the selected model rather than a single fixed reference window
- browser tests enforce mobile overflow, semantic labels, share-link privacy, and prompt network isolation

The pricing-version decision is documented in `docs/ADR_VERSIONED_PRICING_ENGINE.md`.

## Wave 1C.3 deliberate differentiation

The public acquisition layer now goes beyond calculator parity:

- canonical model pages generated from one sourced catalog
- effective pricing history without fabricated historical periods
- deterministic pairwise comparison canonicalization
- safe workload-only comparison URLs
- normalized model metadata APIs
- source-package SDK onboarding
- pricing snapshot/diff maintenance tooling
- curated programmatic SEO rather than indiscriminate pair generation

These are product-quality and acquisition improvements, not attempts to copy source code or branding from the reference product.
