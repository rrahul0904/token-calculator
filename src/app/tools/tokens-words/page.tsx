import type { Metadata } from "next";
import { TokensWordsCalculator } from "@/components/tokens-words-calculator";
export const metadata: Metadata = { title: "Tokens ↔ Words" };
export default function TokensWordsPage() { return <main className="page-shell shell"><section className="page-hero"><p className="eyebrow">Token sizing</p><h1>Translate token budgets into human scale.</h1><p>Use planning ranges for prose, dense text, or code. For billing and hard context limits, return to the calculator and measure the actual text.</p></section><TokensWordsCalculator /></main>; }
