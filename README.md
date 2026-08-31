# Token Intelligence

A local-first LLM token and cost intelligence workspace inspired by the observable utility of public token calculators, implemented independently from scratch.

**Production:** https://token-intelligence-eight.vercel.app

## What is implemented

- Three planning modes: raw text, word count, or known token count.
- Browser-side OpenAI `o200k_base` reference tokenization using the lightweight `js-tiktoken` rank inside a Web Worker.
- Explicitly labeled byte-based estimates for Anthropic, Gemini, DeepSeek, and xAI until an official compatible local tokenizer is available.
- Token-boundary inspection for the OpenAI `o200k_base` reference.
- Versioned model catalog with provider source URLs and verification dates.
- Input, cached-input, output, and total cost breakdowns.
- Context-window utilization and overflow warnings.
- OpenAI >272K and Grok >=200K long-context pricing warnings.
- Output-size presets and custom percentage planning.
- Monthly spend projection by request volume.
- Responsive no-account UI with no prompt-analysis backend.
- Unit tests, strict TypeScript, production build script, and GitHub Actions CI definition.

## Architecture

The application is intentionally client-heavy. Prompt text never needs to cross a server boundary:

1. `TokenCalculator` sends text to a dedicated browser Web Worker.
2. The worker loads only the local `o200k_base` rank, calculates a reference token count, and returns only to the page.
3. Provider-specific estimated counts are derived locally and are visibly marked as estimates.
4. Pricing metadata ships as versioned application data with source and verification metadata.
5. Cost and budget calculations run entirely in browser memory.

There is no route handler that accepts prompt text.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

The production Vercel build has completed successfully with Next.js 16.3.3, including strict TypeScript validation and static page generation. See `DEPLOYMENT.md` for deployment details.

## Pricing maintenance

Pricing lives in `src/lib/models.ts`. Each catalog row includes provider/model identity, context and output limits, per-million token rates, source URL, verification date, and tokenizer precision classification.

Do not silently treat planning token counts as provider-billed exact counts unless that tokenizer mapping is explicitly verified. Refresh rates when a promotional period expires or a provider changes pricing.

## Clean-room boundary

This project reproduces general, observable calculator behaviors independently. It does not copy proprietary source code, UI assets, branding, or private implementation details from any referenced product.
