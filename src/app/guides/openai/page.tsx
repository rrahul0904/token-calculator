import type { Metadata } from "next";
import { ProviderGuide } from "@/components/provider-guide";

export const metadata: Metadata = {
  title: "OpenAI token and API cost guide",
  description: "Compare current OpenAI model token pricing, context windows, cache-read rates, long-context tiers, and monthly workload cost.",
};

export default function OpenAiGuidePage() {
  return <ProviderGuide
    provider="OpenAI"
    eyebrow="OpenAI planning guide"
    title="OpenAI token cost and context planning"
    description="Compare current GPT model economics from the official model catalog, including cached input and automatic long-context tiers where published."
    countingNote="Token Intelligence uses the o200k_base tokenizer as a local planning reference for compatible OpenAI workloads. Exact request accounting can still differ because messages, tools, images, and request shape add provider-counted tokens."
  />;
}
