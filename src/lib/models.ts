import type { TokenizerFamily } from "@/types/tokenizer";

export type ProviderName = "OpenAI" | "Anthropic" | "Google" | "DeepSeek" | "xAI";

export type ModelPricing = {
  input: number;
  output: number;
  cachedInput?: number;
  cacheWrite5m?: number;
  cacheWrite1h?: number;
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
  pricingLabel?: string;
  sourceUrl: string;
  sourceLabel: string;
  verifiedAt: string;
  note?: string;
};

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    provider: "OpenAI",
    tokenizer: "openai-o200k",
    tokenizerAccuracy: "reference",
    contextWindow: 1_050_000,
    maxOutput: 128_000,
    pricing: { input: 4, cachedInput: 0.4, output: 20 },
    pricingLabel: "Promotional pricing",
    sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-sol",
    sourceLabel: "OpenAI model docs",
    verifiedAt: "2026-08-30",
    note: "The browser count uses the local o200k_base encoding as a planning reference. Requests above 272K input tokens use long-context multipliers; this calculator flags that threshold but does not apply the multiplier automatically.",
  },
  {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    provider: "OpenAI",
    tokenizer: "openai-o200k",
    tokenizerAccuracy: "reference",
    contextWindow: 1_050_000,
    maxOutput: 128_000,
    pricing: { input: 2, cachedInput: 0.2, output: 12 },
    sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-terra",
    sourceLabel: "OpenAI model docs",
    verifiedAt: "2026-08-30",
    note: "The browser count uses the local o200k_base encoding as a planning reference. Requests above 272K input tokens use long-context multipliers; this calculator flags that threshold but does not apply the multiplier automatically.",
  },
  {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    provider: "OpenAI",
    tokenizer: "openai-o200k",
    tokenizerAccuracy: "reference",
    contextWindow: 1_050_000,
    maxOutput: 128_000,
    pricing: { input: 0.2, cachedInput: 0.02, output: 1.2 },
    pricingLabel: "Current rate card",
    sourceUrl: "https://developers.openai.com/api/docs/models/compare",
    sourceLabel: "OpenAI model comparison",
    verifiedAt: "2026-08-30",
    note: "The browser count uses the local o200k_base encoding as a planning reference.",
  },
  {
    id: "claude-fable-5",
    name: "Claude Fable 5",
    provider: "Anthropic",
    tokenizer: "anthropic-estimate",
    tokenizerAccuracy: "estimate",
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    pricing: { input: 10, cachedInput: 1, cacheWrite5m: 12.5, cacheWrite1h: 20, output: 50 },
    sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
    sourceLabel: "Anthropic pricing docs",
    verifiedAt: "2026-08-30",
  },
  {
    id: "claude-opus-5",
    name: "Claude Opus 5",
    provider: "Anthropic",
    tokenizer: "anthropic-estimate",
    tokenizerAccuracy: "estimate",
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    pricing: { input: 5, cachedInput: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10, output: 25 },
    sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
    sourceLabel: "Anthropic pricing docs",
    verifiedAt: "2026-08-30",
  },
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: "Anthropic",
    tokenizer: "anthropic-estimate",
    tokenizerAccuracy: "estimate",
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    pricing: { input: 2, cachedInput: 0.2, cacheWrite5m: 2.5, output: 10 },
    pricingLabel: "Introductory pricing through 2026-08-31",
    sourceUrl: "https://claude.com/pricing",
    sourceLabel: "Anthropic pricing",
    verifiedAt: "2026-08-30",
    note: "Anthropic lists standard Sonnet 5 pricing after the introductory period; refresh the catalog after August 31, 2026.",
  },
  {
    id: "gemini-3.7-flash",
    name: "Gemini 3.7 Flash",
    provider: "Google",
    tokenizer: "gemini-estimate",
    tokenizerAccuracy: "estimate",
    contextWindow: 1_048_576,
    maxOutput: 65_536,
    pricing: { input: 0.75, cachedInput: 0.075, output: 3.75 },
    pricingLabel: "Introductory pricing through 2026-12-31",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    sourceLabel: "Google AI pricing",
    verifiedAt: "2026-08-30",
  },
  {
    id: "grok-4.6",
    name: "Grok 4.6",
    provider: "xAI",
    tokenizer: "grok-estimate",
    tokenizerAccuracy: "estimate",
    contextWindow: 500_000,
    maxOutput: null,
    pricing: { input: 2, cachedInput: 0.5, output: 6 },
    sourceUrl: "https://docs.x.ai/developers/models/grok-4.6",
    sourceLabel: "xAI model docs",
    verifiedAt: "2026-08-30",
    note: "xAI publishes higher long-context rates at 200K+ prompt tokens; this calculator flags the threshold but uses the short-context base rate.",
  },
  {
    id: "deepseek-v4-flash-offpeak",
    name: "DeepSeek V4 Flash — Off-peak",
    provider: "DeepSeek",
    tokenizer: "deepseek-estimate",
    tokenizerAccuracy: "estimate",
    contextWindow: 1_000_000,
    maxOutput: 384_000,
    pricing: { input: 0.22, cachedInput: 0.007, output: 0.66 },
    pricingLabel: "Off-peak",
    sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing/",
    sourceLabel: "DeepSeek pricing docs",
    verifiedAt: "2026-08-30",
  },
  {
    id: "deepseek-v4-flash-peak",
    name: "DeepSeek V4 Flash — Peak",
    provider: "DeepSeek",
    tokenizer: "deepseek-estimate",
    tokenizerAccuracy: "estimate",
    contextWindow: 1_000_000,
    maxOutput: 384_000,
    pricing: { input: 0.44, cachedInput: 0.014, output: 1.32 },
    pricingLabel: "Peak",
    sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing/",
    sourceLabel: "DeepSeek pricing docs",
    verifiedAt: "2026-08-30",
  }
];

export const PROVIDERS: ProviderName[] = ["OpenAI", "Anthropic", "Google", "xAI", "DeepSeek"];

export function modelsByProvider(provider: ProviderName) {
  return MODEL_CATALOG.filter((model) => model.provider === provider);
}
