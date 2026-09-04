import type { Metadata } from "next";
import { ProviderGuide } from "@/components/provider-guide";

export const metadata: Metadata = {
  title: "Gemini token and API cost guide",
  description: "Compare current Gemini text pricing, context windows, promotional rates, cached input, and monthly workload cost.",
  alternates: { canonical: "/guides/gemini" },
  openGraph: { title: "Gemini token and API cost guide", description: "Plan Gemini token, context, cached-input, and promotional API cost.", url: "/guides/gemini" },
};

export default function GeminiGuidePage() {
  return <ProviderGuide
    provider="Google"
    eyebrow="Google Gemini planning guide"
    title="Gemini token cost and context planning"
    description="Compare current Gemini text economics from Google's official pricing data, including temporary promotional rates where they are in effect."
    countingNote="The local browser count is a text-planning estimate for Gemini. Multimodal inputs, thinking tokens, tools, grounding, cache storage, and service tiers can change actual billable usage, so final accounting should come from Google usage telemetry."
  />;
}
