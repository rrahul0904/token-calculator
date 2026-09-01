import type { Metadata } from "next";
import { CostCalculator } from "@/components/cost-calculator";
export const metadata: Metadata = { title: "Cost Lab" };
export default function CostPage() { return <main className="page-shell shell"><section className="page-hero"><p className="eyebrow">Cost Lab</p><h1>Compare one workload across every model.</h1><p>Enter input, cached-read, and expected output tokens once. Token Intelligence applies published long-context tiers automatically and ranks the resulting request cost.</p></section><CostCalculator /></main>; }
