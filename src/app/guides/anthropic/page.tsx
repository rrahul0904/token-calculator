import type { Metadata } from "next";
import { ProviderGuide } from "@/components/provider-guide";

export const metadata: Metadata = {
  title: "Claude token and API cost guide",
  description: "Compare current Claude input, cache, output, context, and monthly workload pricing with explicit tokenizer-estimate labeling.",
};

export default function AnthropicGuidePage() {
  return <ProviderGuide
    provider="Anthropic"
    eyebrow="Anthropic planning guide"
    title="Claude token cost, cache, and context planning"
    description="Compare current Claude standard text economics while keeping cache-read and cache-write pricing distinct from ordinary input."
    countingNote="Claude model generations can tokenize the same text differently. The browser calculator therefore labels Anthropic counts as estimates; use Anthropic's model-specific token counting and measured API usage when enforcing hard production limits or reconciling spend."
  />;
}
