"use client";

import Link from "next/link";
import { calculateCost, monthlyProjection } from "@/lib/cost";
import { MODEL_CATALOG, type ModelCatalogEntry } from "@/lib/models";
import { getTokenizerSpec, tokenizerPrecisionLabel } from "@/lib/tokenizers/registry";

export function CompactModelComparison({
  inputTokensFor,
  outputTokens,
  cachedPercent,
  requestsPerMonth,
}: {
  inputTokensFor: (model: ModelCatalogEntry) => number;
  outputTokens: number;
  cachedPercent: number;
  requestsPerMonth: number;
}) {
  const rows = MODEL_CATALOG
    .filter((model) => model.status !== "legacy")
    .map((model) => {
      const inputTokens = inputTokensFor(model);
      const cachedInputTokens = Math.round(inputTokens * (cachedPercent / 100));
      const cost = calculateCost(model, { inputTokens, cachedInputTokens, outputTokens });
      return { model, inputTokens, cost };
    })
    .sort((a, b) => a.cost.total - b.cost.total);

  return (
    <section className="model-snapshot">
      <div className="model-snapshot__header">
        <div><p className="eyebrow">Live economics</p><h2>Compare the workload, not provider cards.</h2><p>Same workload assumptions across current model profiles. Cheapest is an economics result, not a quality claim.</p></div>
        <Link href="/tools/cost" className="button button--ghost">Open full Cost Lab</Link>
      </div>
      <div className="model-snapshot__table-wrap">
        <table className="model-snapshot__table">
          <thead><tr><th>Model</th><th>Provider</th><th>Input</th><th>Output</th><th>Context</th><th>Request</th><th>Monthly</th><th>Precision</th></tr></thead>
          <tbody>{rows.slice(0, 8).map(({ model, inputTokens, cost }, index) => <tr key={model.id}>
            <td><div className="model-name-cell">{index === 0 && <span className="best-economics">Lowest</span>}<strong>{model.name}</strong></div></td>
            <td>{model.provider}</td>
            <td className="mono">{inputTokens.toLocaleString()}</td>
            <td className="mono">{outputTokens.toLocaleString()}</td>
            <td className="mono">{((inputTokens + outputTokens) / model.contextWindow * 100).toFixed(1)}%</td>
            <td className="mono">${cost.total < .01 ? cost.total.toFixed(4) : cost.total.toFixed(3)}</td>
            <td className="mono">${monthlyProjection(cost.total, requestsPerMonth).toFixed(2)}</td>
            <td><span className={getTokenizerSpec(model.tokenizer).precision === "estimated" ? "source-badge source-badge--estimated" : "source-badge"}>{tokenizerPrecisionLabel(getTokenizerSpec(model.tokenizer).precision)}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="model-snapshot__footer"><span>Long-context tiers apply automatically where published.</span><Link href="/models">View pricing provenance →</Link></div>
    </section>
  );
}
