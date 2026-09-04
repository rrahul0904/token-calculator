"use client";

import { useMemo, useState } from "react";
import { calculateCost, monthlyProjection } from "@/lib/cost";
import { formatMoney, formatTokens } from "@/lib/format";
import { modelsByProvider, type ProviderName } from "@/lib/models";

export function ProviderCostGuide({ provider }: { provider: ProviderName }) {
  const [inputTokens, setInputTokens] = useState(12_000);
  const [cachedTokens, setCachedTokens] = useState(4_000);
  const [outputTokens, setOutputTokens] = useState(1_200);
  const [requestsPerMonth, setRequestsPerMonth] = useState(10_000);

  const rows = useMemo(() => modelsByProvider(provider)
    .filter((model) => model.status !== "legacy")
    .map((model) => {
      const effectiveCachedTokens = model.pricing.cachedInput === undefined ? 0 : Math.min(cachedTokens, inputTokens);
      const cost = calculateCost(model, {
        inputTokens,
        cachedInputTokens: effectiveCachedTokens,
        outputTokens,
      });
      return {
        model,
        cost,
        monthly: monthlyProjection(cost.total, requestsPerMonth),
      };
    })
    .sort((a, b) => a.monthly - b.monthly), [cachedTokens, inputTokens, outputTokens, provider, requestsPerMonth]);

  return (
    <section className="tool-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Interactive workload estimate</p>
          <h2>Compare {provider} models on the same request.</h2>
          <p>Change request size and volume to compare standard text economics. Provider-specific tools, media, storage and regional charges can add cost.</p>
        </div>
      </div>

      <div className="tool-grid tool-grid--3">
        <label>Input tokens
          <input type="number" min="0" value={inputTokens} onChange={(event) => {
            const next = Math.max(0, Number(event.target.value) || 0);
            setInputTokens(next);
            setCachedTokens((current) => Math.min(current, next));
          }} />
        </label>
        <label>Cached-read tokens
          <input type="number" min="0" max={inputTokens} value={cachedTokens} onChange={(event) => setCachedTokens(Math.min(inputTokens, Math.max(0, Number(event.target.value) || 0)))} />
        </label>
        <label>Expected output
          <input type="number" min="0" value={outputTokens} onChange={(event) => setOutputTokens(Math.max(0, Number(event.target.value) || 0))} />
        </label>
      </div>

      <label className="number-input-block">Requests per month
        <input type="number" min="0" value={requestsPerMonth} onChange={(event) => setRequestsPerMonth(Math.max(0, Number(event.target.value) || 0))} />
      </label>

      <div className="pricing-table-wrap">
        <table className="pricing-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Request</th>
              <th>Monthly</th>
              <th>Input / 1M</th>
              <th>Cache / 1M</th>
              <th>Output / 1M</th>
              <th>Context</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ model, cost, monthly }, index) => (
              <tr key={model.id}>
                <td>
                  <strong>{model.name}</strong>
                  <span>{index === 0 ? "Lowest estimate for this workload" : model.pricingLabel ?? model.status ?? "current"}</span>
                </td>
                <td><strong>{formatMoney(cost.total)}</strong></td>
                <td>{formatMoney(monthly)}</td>
                <td>{"$" + cost.effectivePricing.input.toFixed(cost.effectivePricing.input < 1 ? 3 : 2)}</td>
                <td>{model.pricing.cachedInput === undefined ? "Not offered" : "$" + (cost.effectivePricing.cachedInput ?? 0).toFixed((cost.effectivePricing.cachedInput ?? 0) < 1 ? 3 : 2)}</td>
                <td>{"$" + cost.effectivePricing.output.toFixed(cost.effectivePricing.output < 1 ? 3 : 2)}</td>
                <td>{formatTokens(model.contextWindow)}<span>{model.maxOutput ? formatTokens(model.maxOutput) + " max output" : "Output varies"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-note">Cached-read input is applied only to models that publish a cached-input rate. Long-context tiers are selected automatically from the canonical catalog.</p>
    </section>
  );
}
