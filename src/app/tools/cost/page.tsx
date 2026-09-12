import type { Metadata } from "next";
import { CostCalculator } from "@/components/cost-calculator";
import "./cost.css";

export const metadata: Metadata = {
  title: "AI Workload Cost Lab",
  description: "Shareable LLM workload economics with token-to-cost, cost-to-token, caching, pinned model comparison and pricing provenance.",
};

export default function CostPage() {
  return <main className="page-shell shell"><section className="page-hero"><p className="eyebrow">Workload Economics</p><h1>Model the workload, not just the sticker price.</h1><p>Deep-link token volume, input/output mix and cache behavior; reverse a budget into capacity; pin a baseline; and compare current model economics without pretending cheaper means equivalent quality.</p></section><CostCalculator /></main>;
}
