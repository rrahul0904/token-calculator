import type { Metadata } from "next";
import { ContextPacketPlanner } from "@/components/context-packet-planner";

export const metadata: Metadata = {
  title: "Context Packet Lab | Token Intelligence",
  description: "Select bounded, line-numbered coding context privately in your browser before an AI coding task.",
};

export default function ContextPacketPage() {
  return <main className="page-shell shell">
    <section className="page-hero">
      <p className="eyebrow">Token Intelligence · Agent context lab</p>
      <h1>Send relevant code context, not the whole file.</h1>
      <p>Generate bounded, line-referenced excerpts of non-sensitive source code locally. Benchmark character reduction without claiming unverified token or cost savings.</p>
    </section>
    <ContextPacketPlanner />
  </main>;
}
