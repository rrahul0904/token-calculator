"use client";

import { useMemo, useState } from "react";
import { calculateCost, monthlyProjection } from "@/lib/cost";
import { serializeComparisonState, type ComparisonWorkloadState } from "@/lib/comparison-state";
import { formatMoney } from "@/lib/format";
import type { ModelCatalogEntry } from "@/lib/models";
import { getTokenizerSpec, tokenizerPrecisionLabel } from "@/lib/tokenizers/registry";

export function ModelComparisonWorkload({
  left,
  right,
  initial,
  canonicalPath,
}: {
  left: ModelCatalogEntry;
  right: ModelCatalogEntry;
  initial: ComparisonWorkloadState;
  canonicalPath: string;
}) {
  const [state, setState] = useState(initial);
  const [shareStatus, setShareStatus] = useState("");

  const results = useMemo(() => [left, right].map((model) => {
    const cachedInputTokens = Math.round(state.inputTokens * state.cachedPercent / 100);
    const cost = calculateCost(model, {
      inputTokens: state.inputTokens,
      outputTokens: state.outputTokens,
      cachedInputTokens,
    });
    return {
      model,
      cost,
      monthly: monthlyProjection(cost.total, state.requestsPerMonth),
    };
  }), [left, right, state]);

  async function copyLink() {
    const url = window.location.origin + canonicalPath + "?" + serializeComparisonState(state);
    await navigator.clipboard.writeText(url);
    setShareStatus("Comparison link copied. It contains workload numbers only.");
  }

  const delta = results[1].cost.total - results[0].cost.total;

  return <section className="tool-card">
    <div className="section-heading"><div><p className="eyebrow">Shared workload</p><h2>Compare economics on the same assumptions.</h2><p>Lower price does not imply equivalent quality.</p></div></div>
    <div className="tool-grid tool-grid--2">
      <label>Input tokens<input aria-label="Comparison input tokens" type="number" min="0" max="10000000" value={state.inputTokens} onChange={(event) => setState((current) => ({ ...current, inputTokens: Math.max(0, Number(event.target.value) || 0) }))} /></label>
      <label>Output tokens<input aria-label="Comparison output tokens" type="number" min="0" max="10000000" value={state.outputTokens} onChange={(event) => setState((current) => ({ ...current, outputTokens: Math.max(0, Number(event.target.value) || 0) }))} /></label>
      <label>Cached input %<input aria-label="Comparison cached percent" type="number" min="0" max="100" value={state.cachedPercent} onChange={(event) => setState((current) => ({ ...current, cachedPercent: Math.min(100, Math.max(0, Number(event.target.value) || 0)) }))} /></label>
      <label>Requests / month<input aria-label="Comparison requests per month" type="number" min="0" value={state.requestsPerMonth} onChange={(event) => setState((current) => ({ ...current, requestsPerMonth: Math.max(0, Number(event.target.value) || 0) }))} /></label>
    </div>
    <div className="pricing-table-wrap docs-section"><table className="pricing-table"><thead><tr><th>Model</th><th>Request</th><th>Monthly</th><th>Input / 1M</th><th>Cache / 1M</th><th>Output / 1M</th><th>Tokenizer</th></tr></thead><tbody>
      {results.map(({ model, cost, monthly }) => <tr key={model.id}><td><strong>{model.name}</strong><span>{model.provider}</span></td><td><strong>{formatMoney(cost.total)}</strong></td><td>{formatMoney(monthly)}</td><td>{"$" + cost.effectivePricing.input}</td><td>{cost.effectivePricing.cachedInput === undefined ? "Not offered" : "$" + cost.effectivePricing.cachedInput}</td><td>{"$" + cost.effectivePricing.output}</td><td>{tokenizerPrecisionLabel(getTokenizerSpec(model.tokenizer).precision)}<span>{getTokenizerSpec(model.tokenizer).displayName}</span></td></tr>)}
    </tbody></table></div>
    <div className="form-actions docs-section"><button className="button button--ghost" type="button" onClick={copyLink}>Copy comparison link</button><span role="status" className="muted">{shareStatus}</span></div>
    <p className="table-note">Request cost delta ({right.name} minus {left.name}): {delta >= 0 ? "+" : ""}{formatMoney(delta)}. This is an economics comparison only.</p>
  </section>;
}
