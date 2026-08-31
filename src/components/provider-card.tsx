"use client";

import { useMemo, useState } from "react";
import { calculateCost, contextUsage, monthlyProjection } from "@/lib/cost";
import { formatCompactMoney, formatMoney, formatTokens } from "@/lib/format";
import type { ModelCatalogEntry, ProviderName } from "@/lib/models";

const providerMark: Record<ProviderName, string> = {
  OpenAI: "OA",
  Anthropic: "AN",
  Google: "G",
  DeepSeek: "DS",
  xAI: "X",
};

type ProviderCardProps = {
  provider: ProviderName;
  models: ModelCatalogEntry[];
  inputTokensFor: (model: ModelCatalogEntry) => number;
  outputTokens: number;
  cachedPercent: number;
  requestsPerMonth: number;
};

export function ProviderCard({ provider, models, inputTokensFor, outputTokens, cachedPercent, requestsPerMonth }: ProviderCardProps) {
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const model = models.find((entry) => entry.id === modelId) ?? models[0];

  const calculation = useMemo(() => {
    if (!model) return null;
    const inputTokens = inputTokensFor(model);
    const cachedInputTokens = model.pricing.cachedInput ? Math.round(inputTokens * (cachedPercent / 100)) : 0;
    const cost = calculateCost(model, { inputTokens, outputTokens, cachedInputTokens });
    return {
      inputTokens,
      cachedInputTokens,
      cost,
      context: contextUsage(inputTokens, outputTokens, model.contextWindow),
      monthly: monthlyProjection(cost.total, requestsPerMonth),
    };
  }, [model, inputTokensFor, outputTokens, cachedPercent, requestsPerMonth]);

  if (!model || !calculation) return null;

  const warning = calculation.inputTokens + outputTokens > model.contextWindow;
  const openAiLongContext = provider === "OpenAI" && calculation.inputTokens > 272_000;
  const grokLongContext = provider === "xAI" && calculation.inputTokens >= 200_000;

  async function copyEstimate() {
    const text = `${model.name}: ${formatTokens(calculation.inputTokens)} input + ${formatTokens(outputTokens)} output tokens ≈ ${formatMoney(calculation.cost.total)} per request (${formatCompactMoney(calculation.monthly)}/month at ${formatTokens(requestsPerMonth)} requests).`;
    await navigator.clipboard.writeText(text);
  }

  return (
    <article className="provider-card">
      <div className="provider-card__heading">
        <span className="provider-mark" aria-hidden="true">{providerMark[provider]}</span>
        <div>
          <p className="eyebrow">{provider}</p>
          <h3>{model.name}</h3>
        </div>
        <span className={`accuracy-badge accuracy-badge--${model.tokenizerAccuracy}`}>
          {model.tokenizerAccuracy === "exact" ? "Exact tokenizer" : "Estimated tokens"}
        </span>
      </div>

      <label className="field-label" htmlFor={`${provider}-model`}>Model</label>
      <select id={`${provider}-model`} value={model.id} onChange={(event) => setModelId(event.target.value)}>
        {models.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select>

      <div className="token-row">
        <div><span>Input tokens</span><strong>{formatTokens(calculation.inputTokens)}</strong></div>
        <div><span>Output tokens</span><strong>{formatTokens(outputTokens)}</strong></div>
        <div><span>Context used</span><strong>{calculation.context.toFixed(calculation.context < 1 ? 2 : 1)}%</strong></div>
      </div>

      <div className="cost-grid">
        <div><span>Input</span><strong>{formatMoney(calculation.cost.input)}</strong></div>
        {model.pricing.cachedInput !== undefined && <div><span>Cached input</span><strong>{formatMoney(calculation.cost.cachedInput)}</strong></div>}
        <div><span>Output</span><strong>{formatMoney(calculation.cost.output)}</strong></div>
        <div className="cost-grid__total"><span>Est. total</span><strong>{formatMoney(calculation.cost.total)}</strong></div>
      </div>

      <div className="monthly-line">
        <span>Projected monthly</span>
        <strong>{formatCompactMoney(calculation.monthly)}</strong>
      </div>

      {(warning || openAiLongContext || grokLongContext) && (
        <div className="warning" role="status">
          {warning
            ? "This request exceeds the advertised context window for this model."
            : openAiLongContext
              ? "OpenAI documents long-context pricing multipliers above 272K input tokens; this estimate currently uses the base rate."
              : "xAI publishes higher Grok 4.6 long-context rates at 200K+ prompt tokens; this estimate currently uses the short-context base rate."}
        </div>
      )}

      <div className="provider-card__footer">
        <button className="button button--ghost" type="button" onClick={copyEstimate}>Copy estimate</button>
        <a href={model.sourceUrl} target="_blank" rel="noreferrer">Pricing source ↗</a>
      </div>
      <p className="source-note">Verified {model.verifiedAt}{model.pricingLabel ? ` · ${model.pricingLabel}` : ""}</p>
    </article>
  );
}
