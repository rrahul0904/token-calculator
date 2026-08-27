# Token Calculator — Reverse Engineering Dossier

Reference: https://token-calculator.net/
Audit date: 2026-08-26

## Product thesis
A privacy-preserving browser utility that tokenizes pasted text locally, visualizes token boundaries, summarizes text metrics, and converts token counts into estimated API costs across major model providers.

## Observable capabilities
- Paste text/code/JSON/document content
- Local token visualization
- Token, word and character counts
- Provider/model pricing comparison
- Input-cost estimation based on exact token count
- Multi-provider model table
- Prompt-planning utility
- Privacy positioning around local processing

## Primary actors
- Developer
- AI product manager
- Prompt engineer
- API cost analyst

## Likely domain model
Most computation can remain client-side. Durable server data is limited to pricing/catalog metadata.

- Provider(id, name)
- Model(id, provider_id, tokenizer_family, context_window, pricing_version)
- Price(id, model_id, input_per_million, cached_input_per_million, output_per_million, effective_from)
- TokenizationResult(token_ids[], token_texts[], counts)
- CostEstimate(model_id, input_tokens, output_tokens, estimated_cost)

## Core engine
### Tokenizer registry
Provide tokenizer adapters by model family. Cache tokenizer assets locally. If an exact model tokenizer is unavailable, clearly label an approximation rather than presenting a false exact count.

### Pricing engine
pricing_catalog + token counts + optional projected output tokens -> input/cached/output/total cost estimate.

### Local-first privacy
The pasted prompt should not need to leave the browser for tokenization. Pricing metadata can be fetched separately and cached.

## Architecture hypothesis
- Next.js static/client-heavy app
- Web Workers for tokenization to keep UI responsive
- tiktoken-compatible WASM/JS adapters where applicable
- Provider-specific tokenizer packages or documented approximation strategies
- Small pricing API/static versioned JSON catalog
- Scheduled pricing updater with review before publication

## MVP
- OpenAI tokenizer family support
- Claude approximation/official-compatible strategy where available
- Gemini tokenizer strategy
- Token visualization
- Word/character counts
- Model cost comparison table
- Input/output token sliders
- Copy/export result
- No-account mode

## Phase 2
- Batch file analysis
- API endpoint/SDK
- Compare prompt variants
- Context-window overflow warnings
- Cost budget planner
- Cached-token estimation
- Historical pricing versions
- Shareable calculation URLs with text excluded by default

## Acceptance criteria
- Local tokenization works with network disabled after assets are loaded.
- UI differentiates exact tokenization from approximation.
- Pricing calculations use versioned rates.
- No pasted content is logged server-side by default.
- Large prompts do not freeze the main UI thread.
- Cost estimate can model both input and expected output tokens.

## Clean-room boundary
Reproduce observable utility behavior independently. Do not copy proprietary UI, copywriting, assets or undisclosed implementation details.
