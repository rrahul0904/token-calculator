# Live reference audit — Token-Calculator.net

Audit date: 2026-09-04  
Reference: https://token-calculator.net/  
Implementation branch: `vibe-reverse-engineering-token-calculator`

## Scope and clean-room boundary

This audit uses only publicly accessible pages and public provider documentation. No authenticated dashboard, checkout, private API, source code, or restricted surface was accessed.

The implementation reproduces useful public workflows independently and deliberately does not copy branding, visual assets, proprietary source, or page copy.

## Public routes reviewed

Observed directly from the public site and its navigation:

| Route | Public purpose | Primary behavior |
| --- | --- | --- |
| `/` | Main calculator | Local token count, token visualization, text metrics, pricing table |
| `/openai-token-calculator` | OpenAI guide | GPT model/context/pricing guide with workload calculator |
| `/claude-token-calculator` | Anthropic guide | Claude model/cache/context guide with workload calculator |
| `/gemini-token-calculator` | Gemini guide | Gemini model/multimodal/pricing guide with workload calculator |
| `/token-cost-calculator` | Cost planning | Input/cache/output token cost comparison |
| `/tokens-to-words` | Size conversion | Approximate tokens ↔ words planning |
| `/llm-memory-calculator` | Infrastructure planning | Model-weight / VRAM estimate |
| `/token-speed-simulator` | Latency planning | Tokens/sec and generation-time simulation |
| `/token-api` | Developer funnel | Bearer-key tokenize endpoint and examples |
| `/pricing` | Commercial funnel | Monthly/yearly Token API packaging |

## Main calculator behavior observed

The public calculator currently exposes:

- browser-local positioning: submitted text stays in the browser
- token-piece visualization
- tokens
- words
- characters excluding spaces
- all characters
- OpenAI / Anthropic / Google pricing comparison
- input / cached-input / output rates
- context-window visibility
- automatic long-context pricing notes
- dark/light theme
- public use-case and educational content

The reference currently advertises 9 OpenAI, 7 Anthropic, and 8 Google model rows on the main page.

## Developer API behavior observed

Public documentation describes:

```http
POST /api/v1/tokenize
Authorization: Bearer <api-key>
Content-Type: application/json
```

Minimal request:

```json
{ "text": "hello world" }
```

Minimal response:

```json
{
  "tokens": 2,
  "characters": 11,
  "charactersWithoutSpaces": 10,
  "words": 2
}
```

Documented errors include:

- `401 invalid_api_key`
- `402 subscription_required`
- `413 text_too_large`

The public docs state that the endpoint does not require model-specific encoding input and that request text is processed for the response rather than stored.

## Important pricing/source-of-truth differences

Token Intelligence must not blindly copy the reference site's pricing table.

### OpenAI GPT-5.6 Sol

The reference page displayed:

- input: $5 / 1M
- cached input: $0.50 / 1M
- output: $30 / 1M

OpenAI's current GPT-5.6 Sol documentation on 2026-09-04 displays:

- input: $4 / 1M
- cached input: $0.40 / 1M
- output: $20 / 1M

Decision: Token Intelligence keeps the official OpenAI rate and marks the record verified on 2026-09-04.

Official source:
https://developers.openai.com/api/docs/models/gpt-5.6-sol

### Google Gemini 3.6 / 3.7 Flash

The reference page displayed Gemini 3.6 Flash at the future standard rate:

- input: $1.50 / 1M
- cached input: $0.15 / 1M
- output: $7.50 / 1M

Google's pricing documentation states that Gemini 3.6 Flash and Gemini 3.7 Flash use introductory pricing through 2026-12-31:

- input: $0.75 / 1M
- cached input: $0.075 / 1M
- output: $3.75 / 1M

Decision: Token Intelligence uses the currently effective promotional rate and labels the expiry date.

Official sources:
https://ai.google.dev/gemini-api/docs/pricing
https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash

### Anthropic catalog freshness

Anthropic's official pricing now includes Claude Fable 5.1 and Claude Mythos 5.1. Fable 5.1 has the same $10 input / $50 output rate as Fable 5, but cache hits are $0.25 / MTok rather than $1 / MTok.

Decision: add Fable 5.1 and Mythos 5.1 to the Token Intelligence catalog even though they were not yet present in the audited reference site's main model table.

Official source:
https://platform.claude.com/docs/en/about-claude/pricing

## First implementation slice

This audit immediately produced code changes rather than stopping at research:

- refreshed the canonical model catalog with current official-source records
- added GPT-5.5 Pro
- added Claude Fable 5.1 / Mythos 5.1 / Mythos 5 / Opus 4.8
- added Gemini 3.7 Flash / 3.6 Flash / 3.5 Flash / 3.5 Flash-Lite
- added provider-specific public guide routes
- added provider workload/monthly-cost comparison UI
- added public sitemap coverage
- added E2E coverage for provider routes and sitemap
- added a network-body privacy regression for the anonymous calculator

## Next parity targets

The next implementation slice should focus on:

1. exact/estimated tokenizer precision UX as a first-class shared type rather than provider-specific metric fields
2. richer token-piece rendering for large inputs without DOM growth
3. explicit effective-date/version support for pricing records
4. provider/model programmatic metadata and canonical URLs
5. API compatibility hardening and request-size/auth/error tests
6. mobile and accessibility checks for the new guide and calculator surfaces

## Wave 1C.2 implementation evidence

The follow-on hardening wave converts the first parity slice into reusable domain architecture:

- provider-specific token-count fields replaced by a tokenizer-family result registry
- precision vocabulary made explicit
- effective-dated pricing versions added for temporary Gemini 3.6/3.7 Flash rates
- long-context threshold boundary documented and tested
- unsupported cache pricing corrected so input is never silently free
- context headroom and overflow made model-aware
- workload sharing made prompt-safe
- tokenize API extended without breaking the original `{ "text": ... }` request
- canonical metadata/structured data and mobile/privacy browser tests expanded

These changes are deliberate improvements over the observable reference rather than pixel or source-code cloning.
