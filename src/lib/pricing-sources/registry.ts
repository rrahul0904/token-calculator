import type { ProviderName } from "@/lib/models";

export interface PricingSourceDefinition {
  provider: ProviderName;
  label: string;
  sourceUrl: string;
  trust: "official";
  ingestion: "manual_verification";
}

export const PRICING_SOURCE_REGISTRY: PricingSourceDefinition[] = [
  { provider: "OpenAI", label: "OpenAI model documentation", sourceUrl: "https://developers.openai.com/api/docs/models", trust: "official", ingestion: "manual_verification" },
  { provider: "Anthropic", label: "Anthropic pricing documentation", sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing", trust: "official", ingestion: "manual_verification" },
  { provider: "Google", label: "Google Gemini API pricing", sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing", trust: "official", ingestion: "manual_verification" },
  { provider: "xAI", label: "xAI model documentation", sourceUrl: "https://docs.x.ai/developers/models", trust: "official", ingestion: "manual_verification" },
  { provider: "DeepSeek", label: "DeepSeek pricing documentation", sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing/", trust: "official", ingestion: "manual_verification" },
];
