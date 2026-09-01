import type { Metadata } from "next";
import { BatchAnalyzer } from "@/components/batch-analyzer";

export const metadata: Metadata = { title: "Local Batch Token Analysis" };

export default function BatchAnalysisPage() {
  return <main className="page-shell shell">
    <section className="page-hero"><p className="eyebrow">Private batch analysis</p><h1>Estimate a folder of text workloads without uploading the files.</h1><p>Analyze bounded text, Markdown, JSON, CSV, and log files in the browser. Compare reference tokens, provider estimates, context fit, and request economics while keeping file contents local.</p></section>
    <BatchAnalyzer />
  </main>;
}
