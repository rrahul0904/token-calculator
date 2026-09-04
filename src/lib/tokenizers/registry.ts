import type { TokenizerFamily, TokenizerPrecision } from "@/types/tokenizer";

export interface TokenizerAdapterSpec {
  id: string;
  family: TokenizerFamily;
  precision: TokenizerPrecision;
  displayName: string;
  source: string;
  caveat: string;
  estimatedUtf8BytesPerToken?: number;
}

export const TOKENIZER_REGISTRY: Record<TokenizerFamily, TokenizerAdapterSpec> = {
  "openai-o200k": {
    id: "openai-o200k-reference",
    family: "openai-o200k",
    precision: "provider_reference",
    displayName: "o200k_base",
    source: "OpenAI-compatible o200k_base local tokenizer",
    caveat: "A tokenizer-family reference is not a guarantee that every provider request has identical message, tool, image, or wrapper overhead.",
  },
  "anthropic-estimate": {
    id: "anthropic-local-estimate",
    family: "anthropic-estimate",
    precision: "estimated",
    displayName: "Anthropic planning estimate",
    source: "Local UTF-8 byte heuristic",
    caveat: "Use Anthropic model-specific token counting or measured API usage for hard production limits and billing reconciliation.",
    estimatedUtf8BytesPerToken: 3.65,
  },
  "gemini-estimate": {
    id: "gemini-local-estimate",
    family: "gemini-estimate",
    precision: "estimated",
    displayName: "Gemini planning estimate",
    source: "Local UTF-8 byte heuristic",
    caveat: "Multimodal inputs, thinking, tools, grounding, and provider wrappers can change actual Gemini usage.",
    estimatedUtf8BytesPerToken: 4,
  },
  "deepseek-estimate": {
    id: "deepseek-local-estimate",
    family: "deepseek-estimate",
    precision: "estimated",
    displayName: "DeepSeek planning estimate",
    source: "Local UTF-8 byte heuristic",
    caveat: "Use provider-measured usage for final DeepSeek billing and quota decisions.",
    estimatedUtf8BytesPerToken: 3.8,
  },
  "grok-estimate": {
    id: "grok-local-estimate",
    family: "grok-estimate",
    precision: "estimated",
    displayName: "xAI planning estimate",
    source: "Local UTF-8 byte heuristic",
    caveat: "Use xAI provider-measured usage for final production accounting.",
    estimatedUtf8BytesPerToken: 4,
  },
};

const encoder = new TextEncoder();

export function getTokenizerSpec(family: TokenizerFamily): TokenizerAdapterSpec {
  return TOKENIZER_REGISTRY[family];
}

export function estimateTokensForFamily(text: string, family: Exclude<TokenizerFamily, "openai-o200k">): number {
  if (!text) return 0;
  const divisor = TOKENIZER_REGISTRY[family].estimatedUtf8BytesPerToken;
  if (!divisor) return 0;
  return Math.max(1, Math.ceil(encoder.encode(text).length / divisor));
}

export function tokenizerPrecisionLabel(precision: TokenizerPrecision): string {
  switch (precision) {
    case "exact": return "Exact";
    case "provider_reference": return "Provider reference";
    case "compatible_family": return "Compatible family";
    case "estimated": return "Planning estimate";
  }
}
