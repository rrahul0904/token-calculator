import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LLM pricing guides",
  description: "Provider-specific token, context, and API cost planning guides backed by the same verified pricing catalog as Token Intelligence.",
};

const guides = [
  { href: "/guides/openai", title: "OpenAI", body: "Compare GPT token economics, long-context tiers, cache-read pricing, and request volume." },
  { href: "/guides/anthropic", title: "Anthropic", body: "Compare Claude input, cache-read, cache-write, output, and context economics." },
  { href: "/guides/gemini", title: "Google Gemini", body: "Compare Gemini text pricing, current promotional rates, context limits, and monthly workload cost." },
];

export default function GuidesPage() {
  return <main className="page-shell shell">
    <section className="page-hero"><p className="eyebrow">Provider guides</p><h1>Plan with current rates, not copied pricing tables.</h1><p>Each guide is generated from the same canonical model catalog used by the calculator and links back to official provider documentation.</p></section>
    <section className="tool-link-grid">{guides.map((guide) => <Link key={guide.href} href={guide.href} className="tool-link"><p className="eyebrow">Pricing + context</p><h2>{guide.title}</h2><p>{guide.body}</p><span>Open guide →</span></Link>)}</section>
  </main>;
}
