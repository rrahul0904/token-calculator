import type { Metadata } from "next";
import { MemoryCalculator } from "@/components/memory-calculator";
export const metadata: Metadata = { title: "GPU RAM calculator" };
export default function MemoryPage() { return <main className="page-shell shell"><section className="page-hero"><p className="eyebrow">Self-hosted LLM planning</p><h1>Estimate model weight and VRAM requirements.</h1><p>Explore parameter count, precision, and runtime overhead before choosing hardware. The estimate is intentionally transparent so it can be challenged and adjusted.</p></section><MemoryCalculator /></main>; }
