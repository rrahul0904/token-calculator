"use client";

import { useMemo, useState } from "react";
import { calculateCost, contextUsage, monthlyProjection } from "@/lib/cost";
import { formatMoney, formatTokens } from "@/lib/format";
import type { ModelCatalogEntry } from "@/lib/models";

export function ModelCostEstimator({ model }: { model: ModelCatalogEntry }) {
  const [inputTokens, setInputTokens] = useState(100_000);
  const [outputTokens, setOutputTokens] = useState(10_000);
  const [cachedPercent, setCachedPercent] = useState(0);
  const [requests, setRequests] = useState(10_000);

  const result = useMemo(() => {
    const cachedInputTokens = Math.round(inputTokens * cachedPercent / 100);
    const cost = calculateCost(model, { inputTokens, outputTokens, cachedInputTokens });
    return {
      cost,
      monthly: monthlyProjection(cost.total, requests),
      utilization: contextUsage(inputTokens, outputTokens, model.contextWindow),
      fits: inputTokens + outputTokens <= model.contextWindow,
    };
  }, [cachedPercent, inputTokens, model, outputTokens, requests]);

  return <section className="tool-card docs-section">
    <div className="section-heading">
      <div><p className="eyebrow">Interactive estimator</p><h2>Estimate this workload on {model.name}.</h2><p>Uses the shared effective-dated pricing and long-context resolver.</p></div>
    </div>
    <div className="tool-grid tool-grid--2">
      <label>Input tokens<input aria-label="Model estimator input tokens" type="number" min="0" max="10000000" value={inputTokens} onChange={(event) => setInputTokens(Math.max(0, Number(event.target.value) || 0))} /></label>
      <label>Output tokens<input aria-label="Model estimator output tokens" type="number" min="0" max="10000000" value={outputTokens} onChange={(event) => setOutputTokens(Math.max(0, Number(event.target.value) || 0))} /></label>
      <label>Cached input %<input aria-label="Model estimator cached percent" type="number" min="0" max="100" value={cachedPercent} onChange={(event) => setCachedPercent(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} /></label>
      <label>Requests / month<input aria-label="Model estimator requests per month" type="number" min="0" value={requests} onChange={(event) => setRequests(Math.max(0, Number(event.target.value) || 0))} /></label>
    </div>
    <div className="insight-strip docs-section">
      <div><span>Request</span><strong>{formatMoney(result.cost.total)}</strong><small>{result.cost.pricingTier}</small></div>
      <div><span>Monthly</span><strong>{formatMoney(result.monthly)}</strong><small>{requests.toLocaleString()} requests</small></div>
      <div><span>Context</span><strong>{result.utilization.toFixed(1)}%</strong><small>{result.fits ? formatTokens(model.contextWindow - inputTokens - outputTokens) + " remaining" : "Workload exceeds context"}</small></div>
    </div>
  </section>;
}
