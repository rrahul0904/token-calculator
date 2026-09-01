# Competitive parity wave — Token-Calculator.net

Reference reviewed: https://token-calculator.net/
Review date: 2026-08-31

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
