import type { Metadata } from "next";
import { SpeedSimulator } from "@/components/speed-simulator";
export const metadata: Metadata = { title: "Token speed simulator" };
export default function SpeedPage() { return <main className="page-shell shell"><section className="page-hero"><p className="eyebrow">Streaming UX</p><h1>See what tokens per second feels like.</h1><p>Separate time-to-first-token from decode throughput, set an output budget, and preview the pacing of a streamed response.</p></section><SpeedSimulator /></main>; }
