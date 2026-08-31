"use client";

import { useMemo, useState } from "react";
import { calculateCost } from "@/lib/cost";
import { formatMoney, formatTokens } from "@/lib/format";
import { MODEL_CATALOG } from "@/lib/models";

const presets = [
  { label: "Short prompt", input: 1_000, cached: 0, output: 500 },
  { label: "Support summary", input: 8_000, cached: 2_000, output: 1_200 },
  { label: "Long document", input: 120_000, cached: 20_000, output: 5_000 },
  { label: "Agentic repo", input: 300_000, cached: 160_000, output: 12_000 },
];

export function CostCalculator() {
  const [inputTokens, setInputTokens] = useState(8_000);
  const [cachedTokens, setCachedTokens] = useState(2_000);
  const [outputTokens, setOutputTokens] = useState(1_200);
  const [sort, setSort] = useState<"low" | "high">("low");
  const estimates = useMemo(() => MODEL_CATALOG.map((model) => ({ model, cost: calculateCost(model, { inputTokens, cachedInputTokens: cachedTokens, outputTokens }) })).sort((a, b) => sort === "low" ? a.cost.total - b.cost.total : b.cost.total - a.cost.total), [inputTokens, cachedTokens, outputTokens, sort]);
  const cheapest = estimates.reduce((best, item) => item.cost.total < best.cost.total ? item : best, estimates[0]);
  const highest = estimates.reduce((best, item) => item.cost.total > best.cost.total ? item : best, estimates[0]);
  return <div className="tool-stack"><section className="tool-card cost-input-card"><div className="tool-grid tool-grid--3"><label>Input tokens<input type="number" min="0" value={inputTokens} onChange={(e) => setInputTokens(Number(e.target.value) || 0)} /></label><label>Cached-read input<input type="number" min="0" max={inputTokens} value={cachedTokens} onChange={(e) => setCachedTokens(Math.min(inputTokens, Number(e.target.value) || 0))} /></label><label>Expected output<input type="number" min="0" value={outputTokens} onChange={(e) => setOutputTokens(Number(e.target.value) || 0)} /></label></div><div className="preset-row cost-presets">{presets.map((preset) => <button key={preset.label} className="preset" type="button" onClick={() => { setInputTokens(preset.input); setCachedTokens(preset.cached); setOutputTokens(preset.output); }}>{preset.label}</button>)}</div></section><section className="insight-strip"><div><span>Lowest estimate</span><strong>{formatMoney(cheapest.cost.total)}</strong><small>{cheapest.model.name}</small></div><div><span>Highest estimate</span><strong>{formatMoney(highest.cost.total)}</strong><small>{highest.model.name}</small></div><div><span>Request size</span><strong>{formatTokens(inputTokens + outputTokens)}</strong><small>{formatTokens(cachedTokens)} cached</small></div></section><section className="tool-card"><div className="section-heading compact-heading"><div><p className="eyebrow">Full comparison</p><h2>Estimated cost by model</h2></div><label className="sort-control">Sort<select value={sort} onChange={(e) => setSort(e.target.value as "low" | "high")}><option value="low">Lowest first</option><option value="high">Highest first</option></select></label></div><div className="pricing-table-wrap"><table className="pricing-table"><thead><tr><th>Model</th><th>Input</th><th>Cache read</th><th>Output</th><th>Total</th><th>Pricing tier</th></tr></thead><tbody>{estimates.map(({ model, cost }) => <tr key={model.id}><td><strong>{model.name}</strong><span>{model.provider}</span></td><td>{formatMoney(cost.input)}</td><td>{model.pricing.cachedInput === undefined ? "—" : formatMoney(cost.cachedInput)}</td><td>{formatMoney(cost.output)}</td><td><strong>{formatMoney(cost.total)}</strong></td><td><span className={cost.pricingTier.startsWith("Long") ? "tier-pill tier-pill--warn" : "tier-pill"}>{cost.pricingTier}</span></td></tr>)}</tbody></table></div></section></div>;
}
