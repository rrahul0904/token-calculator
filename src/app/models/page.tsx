import type { Metadata } from "next";
import { ModelPricingTable } from "@/components/model-pricing-table";
import { MODEL_CATALOG } from "@/lib/models";
export const metadata: Metadata = { title: "Model pricing" };
export default function ModelsPage() { return <main className="page-shell shell"><section className="page-hero"><p className="eyebrow">Live planning catalog</p><h1>Model pricing without the spreadsheet.</h1><p>Search {MODEL_CATALOG.length} model profiles across major providers. Long-context pricing tiers are represented in the same catalog used by the calculators.</p></section><section className="tool-card"><ModelPricingTable /></section></main>; }
