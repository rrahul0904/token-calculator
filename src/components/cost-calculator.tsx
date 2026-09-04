"use client";

import { useEffect, useMemo, useState } from "react";
import { MODEL_CATALOG } from "@/lib/models";
import {
  DEFAULT_WORKLOAD_SCENARIO,
  WORKLOAD_PRESETS,
  parseWorkloadQuery,
  resolveScenarioEstimate,
  serializeWorkloadQuery,
  type WorkloadScenario,
} from "@/lib/economics/workload";
import { endpointsForModel } from "@/lib/pricing/catalog";

function money(value: number | null | undefined) {
  if (value === null || value === undefined) return "Unknown";
  if (Math.abs(value) < 0.01) return "$" + value.toFixed(4);
  return "$" + value.toFixed(2);
}

function tokens(value: number) {
  return value.toLocaleString("en-US");
}

function percent(value: number | null | undefined) {
  return value === null || value === undefined ? "Unknown" : value.toFixed(1) + "%";
}

export function CostCalculator() {
  const [scenario, setScenario] = useState<WorkloadScenario>(DEFAULT_WORKLOAD_SCENARIO);
  const [advanced, setAdvanced] = useState(false);
  const [ready, setReady] = useState(false);
  const [copyState, setCopyState] = useState("");

  useEffect(() => {
    const syncFromUrl = () => setScenario(parseWorkloadQuery(window.location.search));
    syncFromUrl();
    setReady(true);
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const query = serializeWorkloadQuery(scenario);
    const next = window.location.pathname + "?" + query;
    if (window.location.pathname + window.location.search !== next) window.history.replaceState(null, "", next);
  }, [ready, scenario]);

  const selected = MODEL_CATALOG.find((model) => model.id === scenario.modelId) ?? MODEL_CATALOG[0];
  const endpointOptions = useMemo(() => endpointsForModel(scenario.modelId), [scenario.modelId]);
  const estimate = useMemo(() => resolveScenarioEstimate(scenario), [scenario]);
  const baselineId = scenario.pinnedModelId ?? scenario.modelId;
  const baseline = useMemo(() => resolveScenarioEstimate({
    ...scenario,
    modelId: baselineId,
    endpointId: baselineId === scenario.modelId ? scenario.endpointId : null,
  }), [baselineId, scenario]);

  const comparisons = useMemo(() => MODEL_CATALOG
    .filter((model) => model.status !== "legacy")
    .map((model) => {
      const candidate = resolveScenarioEstimate({
        ...scenario,
        modelId: model.id,
        endpointId: model.id === scenario.modelId ? scenario.endpointId : null,
      });
      const candidateTokens = candidate ? candidate.buckets.inputTokens + candidate.buckets.outputTokens : 0;
      const baselineTokens = baseline ? baseline.buckets.inputTokens + baseline.buckets.outputTokens : 0;
      const costDelta = candidate?.cost.totalUsd == null || baseline?.cost.totalUsd == null
        ? null
        : candidate.cost.totalUsd - baseline.cost.totalUsd;
      return { model, candidate, costDelta, tokenDelta: candidateTokens - baselineTokens };
    })
    .sort((left, right) => scenario.mode === "cost2tokens"
      ? (right.candidate?.buckets.inputTokens ?? 0) - (left.candidate?.buckets.inputTokens ?? 0)
      : (left.candidate?.cost.totalUsd ?? Number.POSITIVE_INFINITY) - (right.candidate?.cost.totalUsd ?? Number.POSITIVE_INFINITY)),
  [baseline, scenario]);

  function patch(next: Partial<WorkloadScenario>) {
    setScenario((current) => ({ ...current, ...next }));
  }

  function applyPreset(preset: typeof WORKLOAD_PRESETS[number]) {
    patch({
      totalTokens: preset.totalTokens,
      inputPercent: preset.inputPercent,
      cacheableInputPercent: preset.cacheableInputPercent,
      cacheHitPercent: preset.cacheHitPercent,
      requestsPerMonth: preset.requestsPerMonth,
      cacheWrite5mPercent: 0,
      cacheWrite1hPercent: 0,
    });
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState("Copied");
    } catch {
      setCopyState("Copy unavailable");
    }
    window.setTimeout(() => setCopyState(""), 1600);
  }

  const resultTokens = estimate ? estimate.buckets.inputTokens + estimate.buckets.outputTokens : 0;
  const workspaceHref = "/app/cost-lab?" + serializeWorkloadQuery(scenario);

  return <div className="tool-stack workload-lab" data-testid="workload-cost-lab">
    <section className="tool-card workload-config">
      <div className="workload-toolbar">
        <div className="mode-switch" role="group" aria-label="Calculation mode">
          <button type="button" className={scenario.mode === "tokens2cost" ? "preset preset--active" : "preset"} onClick={() => patch({ mode: "tokens2cost" })}>Tokens → cost</button>
          <button type="button" className={scenario.mode === "cost2tokens" ? "preset preset--active" : "preset"} onClick={() => patch({ mode: "cost2tokens" })}>Cost → tokens</button>
        </div>
        <div className="workload-actions">
          <button className="button button--ghost" type="button" onClick={() => patch({ pinnedModelId: scenario.modelId })}>Pin {selected.name}</button>
          <button className="button button--ghost" type="button" onClick={copyShareLink}>Copy share link</button>
          <a className="button button--ghost" href={workspaceHref}>Open in workspace</a>
          <span className="copy-state" aria-live="polite">{copyState}</span>
        </div>
      </div>

      <div className="tool-grid tool-grid--3 workload-primary-grid">
        <label>Model<select aria-label="Model" value={scenario.modelId} onChange={(event) => patch({ modelId: event.target.value, endpointId: null })}>{MODEL_CATALOG.filter((model) => model.status !== "legacy").map((model) => <option key={model.id} value={model.id}>{model.name} · {model.provider}</option>)}</select></label>
        <label>Inference endpoint<select aria-label="Inference endpoint" value={scenario.endpointId ?? ""} onChange={(event) => patch({ endpointId: event.target.value || null })}><option value="">Catalog default</option>{endpointOptions.map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{endpoint.inferenceProvider} · {endpoint.externalModelId}</option>)}</select></label>
        {scenario.mode === "tokens2cost"
          ? <label>Total tokens<input aria-label="Total tokens" type="number" min="0" max="1000000000000000" value={scenario.totalTokens} onChange={(event) => patch({ totalTokens: Number(event.target.value) || 0 })} /></label>
          : <label>Budget (USD)<input aria-label="Budget (USD)" type="number" min="0" step="0.01" value={scenario.budgetUsd} onChange={(event) => patch({ budgetUsd: Number(event.target.value) || 0 })} /></label>}
      </div>

      <div className="tool-grid tool-grid--3">
        <label>Input %<input aria-label="Input percent" type="number" min="0" max="100" value={scenario.inputPercent} onChange={(event) => patch({ inputPercent: Number(event.target.value) || 0 })} /></label>
        <label>Cache hit %<input aria-label="Cache hit percent" type="number" min="0" max="100" value={scenario.cacheHitPercent} onChange={(event) => patch({ cacheHitPercent: Number(event.target.value) || 0 })} /></label>
        <label>Requests / month<input aria-label="Requests per month" type="number" min="0" value={scenario.requestsPerMonth} onChange={(event) => patch({ requestsPerMonth: Number(event.target.value) || 0 })} /></label>
      </div>

      <button className="advanced-toggle" type="button" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>{advanced ? "Hide advanced cache assumptions" : "Advanced cache assumptions"}</button>
      {advanced && <div className="tool-grid tool-grid--3 advanced-cache">
        <label>Cacheable input %<input aria-label="Cacheable input percent" type="number" min="0" max="100" value={scenario.cacheableInputPercent} onChange={(event) => patch({ cacheableInputPercent: Number(event.target.value) || 0 })} /><small>How much input can be reused at all.</small></label>
        <label>5m cache-write % of misses<input aria-label="5 minute cache write percent" type="number" min="0" max="100" value={scenario.cacheWrite5mPercent} onChange={(event) => patch({ cacheWrite5mPercent: Number(event.target.value) || 0 })} /><small>Missing write rates stay Unknown.</small></label>
        <label>1h cache-write % of misses<input aria-label="1 hour cache write percent" type="number" min="0" max="100" value={scenario.cacheWrite1hPercent} onChange={(event) => patch({ cacheWrite1hPercent: Number(event.target.value) || 0 })} /></label>
      </div>}

      <div className="preset-row workload-presets">{WORKLOAD_PRESETS.map((preset) => <button key={preset.id} className="preset" type="button" onClick={() => applyPreset(preset)}>{preset.label}</button>)}</div>
    </section>

    {estimate && <section className="tool-card workload-result">
      <div className="section-heading compact-heading">
        <div><p className="eyebrow">Transparent economics</p><h2>{scenario.mode === "tokens2cost" ? money(estimate.cost.totalUsd) : tokens(resultTokens) + " tokens"}</h2><p>{estimate.modelName} via {estimate.inferenceProvider} · {estimate.pricingTier}</p></div>
        <div className="pricing-trust"><a href={estimate.pricingSourceUrl} target="_blank" rel="noreferrer">{estimate.pricingSourceLabel}</a><span>{estimate.pricingStale ? "Pricing may be stale" : "Verified " + estimate.pricingVerifiedAt}</span></div>
      </div>
      <div className="economics-grid">
        <div><span>Fresh input</span><strong>{money(estimate.cost.freshInputUsd)}</strong><small>{tokens(estimate.buckets.freshInputTokens)} tokens</small></div>
        <div><span>Cached read</span><strong>{money(estimate.cost.cachedReadUsd)}</strong><small>{tokens(estimate.buckets.cachedReadTokens)} tokens</small></div>
        <div><span>Cache writes</span><strong>{estimate.cost.cacheWrite5mUsd == null || estimate.cost.cacheWrite1hUsd == null ? "Unknown" : money(estimate.cost.cacheWrite5mUsd + estimate.cost.cacheWrite1hUsd)}</strong><small>{tokens(estimate.buckets.cacheWrite5mTokens + estimate.buckets.cacheWrite1hTokens)} tokens</small></div>
        <div><span>Output</span><strong>{money(estimate.cost.outputUsd)}</strong><small>{tokens(estimate.buckets.outputTokens)} tokens</small></div>
        <div><span>No-cache baseline</span><strong>{money(estimate.noCacheCostUsd)}</strong><small>Same workload, all input fresh</small></div>
        <div><span>Cache savings</span><strong>{money(estimate.cacheSavingsUsd)}</strong><small>{percent(estimate.cacheSavingsPercent)}</small></div>
        <div><span>Monthly forecast</span><strong>{money(estimate.monthlyCostUsd)}</strong><small>{tokens(scenario.requestsPerMonth)} requests</small></div>
        <div><span>Context</span><strong>{estimate.contextFits ? "Fits" : "Overflow"}</strong><small>{estimate.contextUtilizationPercent.toFixed(1)}% utilized</small></div>
      </div>
      {estimate.cost.totalUsd === null && <p className="workload-warning">This scenario uses a pricing dimension the selected model or endpoint does not publish. Token Intelligence keeps the result Unknown instead of treating the missing rate as $0.</p>}
    </section>}

    <section className="tool-card">
      <div className="section-heading compact-heading"><div><p className="eyebrow">Pinned workload comparison</p><h2>Same assumptions, current models</h2><p>Baseline: {baseline?.modelName ?? baselineId}. Economics only; capability equivalence is not claimed.</p></div></div>
      <div className="pricing-table-wrap"><table className="pricing-table"><thead><tr><th>Model</th><th>{scenario.mode === "tokens2cost" ? "Request cost" : "Tokens / budget"}</th><th>Δ vs pinned</th><th>Cache saving</th><th>Context</th><th>Evidence</th></tr></thead><tbody>{comparisons.slice(0, 20).map(({ model, candidate, costDelta, tokenDelta }) => <tr key={model.id}><td><strong>{model.name}</strong><span>{model.provider}</span></td><td>{candidate ? scenario.mode === "tokens2cost" ? money(candidate.cost.totalUsd) : tokens(candidate.buckets.inputTokens + candidate.buckets.outputTokens) : "—"}</td><td>{scenario.mode === "tokens2cost" ? money(costDelta) : (tokenDelta >= 0 ? "+" : "") + tokens(tokenDelta)}</td><td>{candidate ? percent(candidate.cacheSavingsPercent) : "—"}</td><td>{candidate?.contextFits ? "Fits" : "Overflow"}</td><td><span className="tier-pill">Economics only</span></td></tr>)}</tbody></table></div>
      <p className="frontier-note">Cost/quality frontier is intentionally hidden until evidence-backed quality scores with source URLs are connected. No synthetic quality score is generated.</p>
    </section>
  </div>;
}
