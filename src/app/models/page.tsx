import type { Metadata } from "next";
import { ModelPricingTable } from "@/components/model-pricing-table";
import { MODEL_CATALOG } from "@/lib/models";

export const metadata: Metadata = {
  title: "LLM model pricing, context & token economics",
  description: "Search sourced LLM model pricing, context windows, cached-input rates, tokenizer precision, and long-context tiers.",
  alternates: { canonical: "/models" },
  openGraph: { title: "LLM model pricing, context & token economics", description: "Search sourced model pricing, context and token economics.", url: "/models" },
};

export default function ModelsPage() {
  return <main className="page-shell shell"><section className="page-hero"><p className="eyebrow">Live planning catalog</p><h1>Model pricing without the spreadsheet.</h1><p>Search {MODEL_CATALOG.length} model profiles across major providers. Open any model for effective pricing, tokenizer certainty, pricing history and workload estimates.</p></section><section className="tool-card"><ModelPricingTable /></section></main>;
}
