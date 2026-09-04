import type { TokenizerFamily } from "@/types/tokenizer";

export type ProviderName = "OpenAI" | "Anthropic" | "Google" | "DeepSeek" | "xAI" | "Z.AI";

export type ModelPricing = {
  input: number;
  output: number;
  cachedInput?: number;
  cacheWrite5m?: number;
  cacheWrite1h?: number;
};

export type PricingVersion = {
  id: string;
  effectiveFrom: string;
  effectiveTo?: string;
  pricing: ModelPricing;
  sourceUrl: string;
  verifiedAt: string;
  label?: string;
  serviceTier?: string;
};

export type LongContextPricing = {
  threshold: number;
  pricing: ModelPricing;
  label: string;
};

export type ModelCatalogEntry = {
  id: string;
  name: string;
  provider: ProviderName;
  tokenizer: TokenizerFamily;
  tokenizerAccuracy: "reference" | "estimate";
  contextWindow: number;
  maxOutput: number | null;
  pricing: ModelPricing;
  pricingVersions?: PricingVersion[];
  longContext?: LongContextPricing;
  pricingLabel?: string;
  sourceUrl: string;
  sourceLabel: string;
  verifiedAt: string;
  note?: string;
  status?: "current" | "legacy" | "preview";
};

const openAiLongContext = (pricing: ModelPricing): LongContextPricing => ({
  threshold: 272_000,
  pricing: {
    input: pricing.input * 2,
    cachedInput: pricing.cachedInput === undefined ? undefined : pricing.cachedInput * 2,
    output: pricing.output * 1.5,
  },
  label: "Long context >272K input",
});

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", provider: "OpenAI", tokenizer: "openai-o200k", tokenizerAccuracy: "reference", contextWindow: 1_050_000, maxOutput: 128_000, pricing: { input: 4, cachedInput: 0.4, output: 20 }, longContext: openAiLongContext({ input: 4, cachedInput: 0.4, output: 20 }), pricingLabel: "Promotional pricing through at least 2026-11-21", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-sol", sourceLabel: "OpenAI model docs", verifiedAt: "2026-08-30" },
  { id: "gpt-5.6-terra", name: "GPT-5.6 Terra", provider: "OpenAI", tokenizer: "openai-o200k", tokenizerAccuracy: "reference", contextWindow: 1_050_000, maxOutput: 128_000, pricing: { input: 2, cachedInput: 0.2, output: 12 }, longContext: openAiLongContext({ input: 2, cachedInput: 0.2, output: 12 }), sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-terra", sourceLabel: "OpenAI model docs", verifiedAt: "2026-08-30" },
  { id: "gpt-5.6-luna", name: "GPT-5.6 Luna", provider: "OpenAI", tokenizer: "openai-o200k", tokenizerAccuracy: "reference", contextWindow: 1_050_000, maxOutput: 128_000, pricing: { input: 0.2, cachedInput: 0.02, output: 1.2 }, longContext: openAiLongContext({ input: 0.2, cachedInput: 0.02, output: 1.2 }), sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-luna", sourceLabel: "OpenAI model docs", verifiedAt: "2026-08-30" },
  { id: "gpt-5.5", name: "GPT-5.5", provider: "OpenAI", tokenizer: "openai-o200k", tokenizerAccuracy: "reference", contextWindow: 1_050_000, maxOutput: 128_000, pricing: { input: 5, cachedInput: 0.5, output: 30 }, longContext: openAiLongContext({ input: 5, cachedInput: 0.5, output: 30 }), sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.5", sourceLabel: "OpenAI model docs", verifiedAt: "2026-09-04" },
  { id: "gpt-5.5-pro", name: "GPT-5.5 Pro", provider: "OpenAI", tokenizer: "openai-o200k", tokenizerAccuracy: "reference", contextWindow: 1_050_000, maxOutput: 128_000, pricing: { input: 30, output: 180 }, longContext: openAiLongContext({ input: 30, output: 180 }), pricingLabel: "Cached input discount not offered", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.5-pro", sourceLabel: "OpenAI model docs", verifiedAt: "2026-09-04" },
  { id: "gpt-5.4", name: "GPT-5.4", provider: "OpenAI", tokenizer: "openai-o200k", tokenizerAccuracy: "reference", contextWindow: 1_050_000, maxOutput: 128_000, pricing: { input: 2.5, cachedInput: 0.25, output: 15 }, longContext: openAiLongContext({ input: 2.5, cachedInput: 0.25, output: 15 }), sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.4", sourceLabel: "OpenAI model docs", verifiedAt: "2026-08-30", status: "legacy" },
  { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", provider: "OpenAI", tokenizer: "openai-o200k", tokenizerAccuracy: "reference", contextWindow: 400_000, maxOutput: 128_000, pricing: { input: 0.75, cachedInput: 0.075, output: 4.5 }, sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.4-mini", sourceLabel: "OpenAI model docs", verifiedAt: "2026-08-30" },
  { id: "gpt-5.4-nano", name: "GPT-5.4 Nano", provider: "OpenAI", tokenizer: "openai-o200k", tokenizerAccuracy: "reference", contextWindow: 400_000, maxOutput: 128_000, pricing: { input: 0.2, cachedInput: 0.02, output: 1.25 }, sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.4-nano", sourceLabel: "OpenAI model docs", verifiedAt: "2026-08-30" },
  { id: "gpt-5.4-pro", name: "GPT-5.4 Pro", provider: "OpenAI", tokenizer: "openai-o200k", tokenizerAccuracy: "reference", contextWindow: 1_050_000, maxOutput: 128_000, pricing: { input: 30, output: 180 }, longContext: openAiLongContext({ input: 30, output: 180 }), sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.4-pro", sourceLabel: "OpenAI model docs", verifiedAt: "2026-08-30" },
  { id: "gpt-5", name: "GPT-5", provider: "OpenAI", tokenizer: "openai-o200k", tokenizerAccuracy: "reference", contextWindow: 400_000, maxOutput: 128_000, pricing: { input: 1.25, cachedInput: 0.125, output: 10 }, sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5", sourceLabel: "OpenAI model docs", verifiedAt: "2026-08-30", status: "legacy" },
  { id: "gpt-5-mini", name: "GPT-5 Mini", provider: "OpenAI", tokenizer: "openai-o200k", tokenizerAccuracy: "reference", contextWindow: 400_000, maxOutput: 128_000, pricing: { input: 0.25, cachedInput: 0.025, output: 2 }, sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5-mini", sourceLabel: "OpenAI model docs", verifiedAt: "2026-08-30", status: "legacy" },
  { id: "gpt-5-nano", name: "GPT-5 Nano", provider: "OpenAI", tokenizer: "openai-o200k", tokenizerAccuracy: "reference", contextWindow: 400_000, maxOutput: 128_000, pricing: { input: 0.05, cachedInput: 0.005, output: 0.4 }, sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5-nano", sourceLabel: "OpenAI model docs", verifiedAt: "2026-08-30", status: "legacy" },
  { id: "claude-fable-5.1", name: "Claude Fable 5.1", provider: "Anthropic", tokenizer: "anthropic-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_000_000, maxOutput: 128_000, pricing: { input: 10, cachedInput: 0.25, cacheWrite5m: 12.5, cacheWrite1h: 20, output: 50 }, pricingLabel: "Fable 5.1 cache reads are 0.025x base input", sourceUrl: "https://platform.claude.com/docs/en/models/fable-5-1/overview", sourceLabel: "Anthropic model docs", verifiedAt: "2026-09-04" },
  { id: "claude-mythos-5.1", name: "Claude Mythos 5.1", provider: "Anthropic", tokenizer: "anthropic-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_000_000, maxOutput: 128_000, pricing: { input: 10, cachedInput: 0.25, cacheWrite5m: 12.5, cacheWrite1h: 20, output: 50 }, pricingLabel: "Limited availability · cache reads are 0.025x base input", sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing", sourceLabel: "Anthropic pricing docs", verifiedAt: "2026-09-04", status: "current" },
  { id: "claude-fable-5", name: "Claude Fable 5", provider: "Anthropic", tokenizer: "anthropic-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_000_000, maxOutput: 128_000, pricing: { input: 10, cachedInput: 1, cacheWrite5m: 12.5, cacheWrite1h: 20, output: 50 }, sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing", sourceLabel: "Anthropic pricing docs", verifiedAt: "2026-09-04" },
  { id: "claude-mythos-5", name: "Claude Mythos 5", provider: "Anthropic", tokenizer: "anthropic-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_000_000, maxOutput: 128_000, pricing: { input: 10, cachedInput: 1, cacheWrite5m: 12.5, cacheWrite1h: 20, output: 50 }, pricingLabel: "Limited availability", sourceUrl: "https://platform.claude.com/docs/en/models/mythos-5/overview", sourceLabel: "Anthropic model docs", verifiedAt: "2026-09-04" },
  { id: "claude-opus-5", name: "Claude Opus 5", provider: "Anthropic", tokenizer: "anthropic-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_000_000, maxOutput: 128_000, pricing: { input: 5, cachedInput: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10, output: 25 }, sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing", sourceLabel: "Anthropic pricing docs", verifiedAt: "2026-09-04" },
  { id: "claude-opus-4.8", name: "Claude Opus 4.8", provider: "Anthropic", tokenizer: "anthropic-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_000_000, maxOutput: 128_000, pricing: { input: 5, cachedInput: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10, output: 25 }, sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing", sourceLabel: "Anthropic pricing docs", verifiedAt: "2026-09-04" },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5", provider: "Anthropic", tokenizer: "anthropic-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_000_000, maxOutput: 128_000, pricing: { input: 2, cachedInput: 0.2, cacheWrite5m: 2.5, cacheWrite1h: 4, output: 10 }, pricingLabel: "Standard $2/$10 rate", sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing", sourceLabel: "Anthropic pricing docs", verifiedAt: "2026-08-30" },
  { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6", provider: "Anthropic", tokenizer: "anthropic-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_000_000, maxOutput: 128_000, pricing: { input: 3, cachedInput: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6, output: 15 }, sourceUrl: "https://platform.claude.com/docs/en/models/sonnet-4-6/overview", sourceLabel: "Anthropic model docs", verifiedAt: "2026-09-04" },
  { id: "claude-haiku-4.5", name: "Claude Haiku 4.5", provider: "Anthropic", tokenizer: "anthropic-estimate", tokenizerAccuracy: "estimate", contextWindow: 200_000, maxOutput: 64_000, pricing: { input: 1, cachedInput: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2, output: 5 }, sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing", sourceLabel: "Anthropic pricing docs", verifiedAt: "2026-09-04" },
  { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash", provider: "Google", tokenizer: "gemini-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_048_576, maxOutput: 65_536, pricing: { input: 1.5, cachedInput: 0.15, output: 7.5 }, pricingVersions: [{ id: "gemini-3.7-flash-intro-2026", effectiveFrom: "2026-08-13", effectiveTo: "2026-12-31", pricing: { input: 0.75, cachedInput: 0.075, output: 3.75 }, sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing", verifiedAt: "2026-09-04", label: "Introductory pricing through 2026-12-31", serviceTier: "standard" }], pricingLabel: "Standard pricing from 2027-01-01", sourceUrl: "https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash", sourceLabel: "Google AI model docs", verifiedAt: "2026-09-04" },
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", provider: "Google", tokenizer: "gemini-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_048_576, maxOutput: 65_536, pricing: { input: 1.5, cachedInput: 0.15, output: 7.5 }, pricingVersions: [{ id: "gemini-3.6-flash-intro-2026", effectiveFrom: "2026-08-13", effectiveTo: "2026-12-31", pricing: { input: 0.75, cachedInput: 0.075, output: 3.75 }, sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing", verifiedAt: "2026-09-04", label: "Introductory pricing through 2026-12-31", serviceTier: "standard" }], pricingLabel: "Standard pricing from 2027-01-01", sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing", sourceLabel: "Google AI pricing", verifiedAt: "2026-09-04" },
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", provider: "Google", tokenizer: "gemini-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_048_576, maxOutput: 65_536, pricing: { input: 1.5, cachedInput: 0.15, output: 9 }, sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing", sourceLabel: "Google AI pricing", verifiedAt: "2026-09-04" },
  { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite", provider: "Google", tokenizer: "gemini-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_048_576, maxOutput: 65_536, pricing: { input: 0.3, cachedInput: 0.03, output: 2.5 }, sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing", sourceLabel: "Google AI pricing", verifiedAt: "2026-09-04" },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview", provider: "Google", tokenizer: "gemini-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_048_576, maxOutput: 65_536, pricing: { input: 2, cachedInput: 0.2, output: 12 }, longContext: { threshold: 200_000, pricing: { input: 4, cachedInput: 0.4, output: 18 }, label: "Long context >200K input" }, sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing", sourceLabel: "Google AI pricing", verifiedAt: "2026-08-30", status: "preview" },
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite", provider: "Google", tokenizer: "gemini-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_048_576, maxOutput: 65_536, pricing: { input: 0.25, cachedInput: 0.025, output: 1.5 }, sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing", sourceLabel: "Google AI pricing", verifiedAt: "2026-08-30" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", tokenizer: "gemini-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_048_576, maxOutput: 65_536, pricing: { input: 1.25, cachedInput: 0.125, output: 10 }, longContext: { threshold: 200_000, pricing: { input: 2.5, cachedInput: 0.25, output: 15 }, label: "Long context >200K input" }, sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing", sourceLabel: "Google AI pricing", verifiedAt: "2026-08-30" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", tokenizer: "gemini-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_048_576, maxOutput: 65_536, pricing: { input: 0.3, cachedInput: 0.03, output: 2.5 }, sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing", sourceLabel: "Google AI pricing", verifiedAt: "2026-08-30" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", provider: "Google", tokenizer: "gemini-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_048_576, maxOutput: 65_536, pricing: { input: 0.1, cachedInput: 0.01, output: 0.4 }, sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing", sourceLabel: "Google AI pricing", verifiedAt: "2026-08-30" },
  { id: "grok-4.6", name: "Grok 4.6", provider: "xAI", tokenizer: "grok-estimate", tokenizerAccuracy: "estimate", contextWindow: 500_000, maxOutput: null, pricing: { input: 2, cachedInput: 0.5, output: 6 }, sourceUrl: "https://docs.x.ai/developers/models/grok-4.6", sourceLabel: "xAI model docs", verifiedAt: "2026-08-30", note: "xAI publishes higher long-context rates at 200K+ prompt tokens; the catalog keeps the short-context rate until the tier is represented explicitly." },
  { id: "deepseek-v4-flash-offpeak", name: "DeepSeek V4 Flash — Off-peak", provider: "DeepSeek", tokenizer: "deepseek-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_000_000, maxOutput: 384_000, pricing: { input: 0.22, cachedInput: 0.007, output: 0.66 }, pricingLabel: "Off-peak", sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing/", sourceLabel: "DeepSeek pricing docs", verifiedAt: "2026-08-30" },
  { id: "deepseek-v4-flash-peak", name: "DeepSeek V4 Flash — Peak", provider: "DeepSeek", tokenizer: "deepseek-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_000_000, maxOutput: 384_000, pricing: { input: 0.44, cachedInput: 0.014, output: 1.32 }, pricingLabel: "Peak", sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing/", sourceLabel: "DeepSeek pricing docs", verifiedAt: "2026-08-30" },
  { id: "glm-5.3-flash", name: "GLM 5.3 Flash", provider: "Z.AI", tokenizer: "deepseek-estimate", tokenizerAccuracy: "estimate", contextWindow: 1_310_720, maxOutput: 131_072, pricing: { input: 0.075, cachedInput: 0.015, output: 0.25 }, pricingLabel: "OpenRouter routed pricing observed 2026-09-04", sourceUrl: "https://openrouter.ai/z-ai/glm-5.3-flash", sourceLabel: "OpenRouter model pricing", verifiedAt: "2026-09-04", note: "Canonical Z.AI model with OpenRouter routed pricing. Tokenization remains an estimate until provider-measured usage is available." },
];

export const PROVIDERS: ProviderName[] = ["OpenAI", "Anthropic", "Google", "xAI", "DeepSeek", "Z.AI"];

export function modelsByProvider(provider: ProviderName) {
  return MODEL_CATALOG.filter((model) => model.provider === provider);
}
