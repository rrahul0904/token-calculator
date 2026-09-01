"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { calculateCost, monthlyProjection } from "@/lib/cost";
import { MODEL_CATALOG, type ProviderName } from "@/lib/models";
import { buildShareUrl, decodeShareState } from "@/lib/planning/share-state";
import type { TokenMetrics } from "@/types/tokenizer";

const EMPTY: TokenMetrics = { requestId: 0, characters: 0, charactersWithoutSpaces: 0, words: 0, openaiExact: 0, anthropicEstimate: 0, geminiEstimate: 0, deepseekEstimate: 0, grokEstimate: 0, pieces: [] };

type ScenarioRecord = { id: string; name: string; scenario: Record<string, unknown>; updatedAt: string; promptHashA?: string | null; promptHashB?: string | null };
type Recommendation = { data: { modelId: string; modelName: string; provider: ProviderName; requestCostUsd: number; monthlyCostUsd: number | null; contextWindow: number }; alternatives?: Array<{ modelId: string; modelName: string; provider: ProviderName; requestCostUsd: number }>; constraintsNotEvaluated?: string[]; warning?: string };

function money(value: number) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  return `${sign}$${absolute < .01 ? absolute.toFixed(4) : absolute.toFixed(2)}`;
}

async function hashText(text: string) {
  if (!text) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function tokenMetricsFromCount(count: number): TokenMetrics {
  return { ...EMPTY, openaiExact: count, anthropicEstimate: count, geminiEstimate: count, deepseekEstimate: count, grokEstimate: count };
}

function numberValue(value: unknown, fallback: number) { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }

export function CostLabWorkspace() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [metricsA, setMetricsA] = useState(EMPTY);
  const [metricsB, setMetricsB] = useState(EMPTY);
  const [outputTokens, setOutputTokens] = useState(1000);
  const [cachedPct, setCachedPct] = useState(0);
  const [requestsDay, setRequestsDay] = useState(333);
  const [requestsMonth, setRequestsMonth] = useState(10_000);
  const [providerFilter, setProviderFilter] = useState<ProviderName | "all">("all");
  const [allowedModelsText, setAllowedModelsText] = useState("");
  const [minimumContextWindow, setMinimumContextWindow] = useState(0);
  const [minimumModelMaxOutput, setMinimumModelMaxOutput] = useState(0);
  const [scenarioName, setScenarioName] = useState("Prompt comparison");
  const [saveState, setSaveState] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [replayState, setReplayState] = useState<string | null>(null);
  const workerA = useRef<Worker | null>(null);
  const workerB = useRef<Worker | null>(null);
  const idA = useRef(0);
  const idB = useRef(0);

  const allowedModelIds = useMemo(() => allowedModelsText.split(",").map((value) => value.trim()).filter(Boolean), [allowedModelsText]);

  async function loadScenarios() {
    const response = await fetch("/api/v1/scenarios", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (response.ok) setScenarios(body?.data ?? []);
  }

  useEffect(() => {
    const first = new Worker(new URL("../workers/tokenizer.worker.ts", import.meta.url));
    const second = new Worker(new URL("../workers/tokenizer.worker.ts", import.meta.url));
    workerA.current = first;
    workerB.current = second;
    first.onmessage = (event: MessageEvent<TokenMetrics>) => { if (event.data.requestId === idA.current) { setMetricsA(event.data); setReplayState(null); } };
    second.onmessage = (event: MessageEvent<TokenMetrics>) => { if (event.data.requestId === idB.current) setMetricsB(event.data); };
    void loadScenarios();

    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("state");
    if (encoded) {
      try {
        const state = decodeShareState(encoded);
        setOutputTokens(state.outputTokens ?? 1000);
        setRequestsMonth(state.requestsPerMonth ?? 10_000);
        setProviderFilter(state.allowedProviders?.length === 1 ? state.allowedProviders[0] as ProviderName : "all");
        setAllowedModelsText((state.allowedModels ?? []).join(","));
        setMinimumContextWindow(state.maxContextTokens ?? 0);
        if (typeof state.inputTokens === "number") setMetricsA(tokenMetricsFromCount(state.inputTokens));
        if (typeof state.cachedInputTokens === "number" && state.inputTokens) setCachedPct(Math.min(100, Math.round(state.cachedInputTokens / state.inputTokens * 100)));
        setSaveState("Loaded content-free shared assumptions");
      } catch { setSaveState("Shared state was invalid and was ignored"); }
    }
    const runId = params.get("runId");
    if (runId) {
      void fetch(`/api/v1/runs/${encodeURIComponent(runId)}`, { cache: "no-store" }).then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.data?.run) throw new Error(body?.error ?? "Unable to load run");
        const run = body.data.run;
        const inputSide = Number(run.freshInputTokens ?? 0) + Number(run.cacheReadTokens ?? 0);
        setMetricsA(tokenMetricsFromCount(inputSide));
        setOutputTokens(Number(run.outputTokens ?? 0));
        const cache = Number(run.cacheReadTokens ?? 0);
        setCachedPct(inputSide > 0 ? Math.round(cache / inputSide * 100) : 0);
        setReplayState(`Counterfactual baseline seeded from ${runId}. This is not measured savings.`);
      }).catch((error) => setReplayState(error instanceof Error ? error.message : "Run replay failed"));
    }

    return () => { first.terminate(); second.terminate(); };
  }, []);

  useEffect(() => {
    if (replayState && !a) return;
    const timeout = window.setTimeout(() => { idA.current += 1; workerA.current?.postMessage({ requestId: idA.current, text: a }); }, 100);
    return () => window.clearTimeout(timeout);
  }, [a, replayState]);
  useEffect(() => {
    const timeout = window.setTimeout(() => { idB.current += 1; workerB.current?.postMessage({ requestId: idB.current, text: b }); }, 100);
    return () => window.clearTimeout(timeout);
  }, [b]);

  const rows = useMemo(() => MODEL_CATALOG.filter((model) => {
    if (model.status === "legacy") return false;
    if (providerFilter !== "all" && model.provider !== providerFilter) return false;
    if (allowedModelIds.length && !allowedModelIds.includes(model.id)) return false;
    if (minimumContextWindow > 0 && model.contextWindow < minimumContextWindow) return false;
    if (minimumModelMaxOutput > 0 && (model.maxOutput ?? 0) < minimumModelMaxOutput) return false;
    return true;
  }).map((model) => {
    const inputA = model.tokenizer === "anthropic-estimate" ? metricsA.anthropicEstimate : model.tokenizer === "gemini-estimate" ? metricsA.geminiEstimate : model.tokenizer === "deepseek-estimate" ? metricsA.deepseekEstimate : model.tokenizer === "grok-estimate" ? metricsA.grokEstimate : metricsA.openaiExact;
    const inputB = model.tokenizer === "anthropic-estimate" ? metricsB.anthropicEstimate : model.tokenizer === "gemini-estimate" ? metricsB.geminiEstimate : model.tokenizer === "deepseek-estimate" ? metricsB.deepseekEstimate : model.tokenizer === "grok-estimate" ? metricsB.grokEstimate : metricsB.openaiExact;
    const costA = calculateCost(model, { inputTokens: inputA, cachedInputTokens: Math.round(inputA * cachedPct / 100), outputTokens }).total;
    const costB = calculateCost(model, { inputTokens: inputB, cachedInputTokens: Math.round(inputB * cachedPct / 100), outputTokens }).total;
    return { model, inputA, inputB, costA, costB, delta: costB - costA, fits: Math.max(inputA, inputB) + outputTokens <= model.contextWindow };
  }).filter((row) => row.fits).sort((x, y) => Math.min(x.costA, x.costB) - Math.min(y.costA, y.costB)), [allowedModelIds, cachedPct, metricsA, metricsB, minimumContextWindow, minimumModelMaxOutput, outputTokens, providerFilter]);

  const currentScenario = useMemo(() => ({
    inputTokensA: metricsA.openaiExact,
    inputTokensB: metricsB.openaiExact,
    wordsA: metricsA.words,
    wordsB: metricsB.words,
    outputTokens,
    cachedPercent: cachedPct,
    requestsPerDay: requestsDay,
    requestsPerMonth: requestsMonth,
    providerFilter,
    allowedModelIds,
    minimumContextWindow,
    minimumModelMaxOutput,
    tokenizerReference: "o200k",
    promptContentStored: false,
    createdFrom: "cost_lab_gap_closure",
    replaySource: replayState ? "historical_run" : null,
    economicEvidenceType: replayState ? "counterfactual_estimate" : "preflight_estimate",
  }), [allowedModelIds, cachedPct, metricsA.openaiExact, metricsA.words, metricsB.openaiExact, metricsB.words, minimumContextWindow, minimumModelMaxOutput, outputTokens, providerFilter, replayState, requestsDay, requestsMonth]);

  async function saveScenario() {
    setSaveState("Saving…");
    const [promptHashA, promptHashB] = await Promise.all([hashText(a), hashText(b)]);
    const response = await fetch("/api/v1/scenarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: scenarioName, promptHashA, promptHashB, scenario: currentScenario }) });
    const body = await response.json().catch(() => ({}));
    if (response.ok) { setSaveState("Saved metadata only"); setActiveScenarioId(body?.data?.id ?? null); await loadScenarios(); }
    else setSaveState(body.error ?? "Save failed");
  }

  function openScenario(scenario: ScenarioRecord) {
    const data = scenario.scenario ?? {};
    setActiveScenarioId(scenario.id);
    setScenarioName(scenario.name);
    setMetricsA(tokenMetricsFromCount(numberValue(data.inputTokensA, 0)));
    setMetricsB(tokenMetricsFromCount(numberValue(data.inputTokensB, 0)));
    setOutputTokens(numberValue(data.outputTokens, 1000));
    setCachedPct(numberValue(data.cachedPercent, 0));
    setRequestsDay(numberValue(data.requestsPerDay, 333));
    setRequestsMonth(numberValue(data.requestsPerMonth, 10_000));
    setProviderFilter(typeof data.providerFilter === "string" && ["OpenAI", "Anthropic", "Google", "xAI", "DeepSeek"].includes(data.providerFilter) ? data.providerFilter as ProviderName : "all");
    setAllowedModelsText(stringArray(data.allowedModelIds).join(","));
    setMinimumContextWindow(numberValue(data.minimumContextWindow, 0));
    setMinimumModelMaxOutput(numberValue(data.minimumModelMaxOutput, 0));
    setReplayState(data.economicEvidenceType === "counterfactual_estimate" ? "Loaded saved counterfactual assumptions; not measured savings." : null);
    setHistoryState(`Opened ${scenario.name}. Prompt text was not stored.`);
  }

  async function renameScenario(scenario: ScenarioRecord) {
    const name = window.prompt("Scenario name", scenario.name)?.trim();
    if (!name || name === scenario.name) return;
    const response = await fetch(`/api/v1/scenarios/${encodeURIComponent(scenario.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    setHistoryState(response.ok ? "Scenario renamed" : "Rename failed");
    await loadScenarios();
  }

  async function duplicateScenario(scenario: ScenarioRecord) {
    const response = await fetch(`/api/v1/scenarios/${encodeURIComponent(scenario.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ duplicate: true }) });
    setHistoryState(response.ok ? "Scenario duplicated" : "Duplicate failed");
    await loadScenarios();
  }

  async function deleteScenario(scenario: ScenarioRecord) {
    if (!window.confirm(`Delete ${scenario.name}?`)) return;
    const response = await fetch(`/api/v1/scenarios/${encodeURIComponent(scenario.id)}`, { method: "DELETE" });
    if (activeScenarioId === scenario.id) setActiveScenarioId(null);
    setHistoryState(response.ok ? "Scenario deleted" : "Delete failed");
    await loadScenarios();
  }

  async function compareAgainstScenario(scenario: ScenarioRecord) {
    const baseline = scenario.scenario ?? {};
    const metrics = {
      baselineScenarioId: scenario.id,
      baselineInputTokens: numberValue(baseline.inputTokensA, 0),
      candidateInputTokens: currentScenario.inputTokensA,
      inputTokenDelta: currentScenario.inputTokensA - numberValue(baseline.inputTokensA, 0),
      baselineRequestsPerMonth: numberValue(baseline.requestsPerMonth, 0),
      candidateRequestsPerMonth: currentScenario.requestsPerMonth,
      verificationSource: "unverified",
      promptContentStored: false,
    };
    const response = await fetch("/api/v1/scenario-comparisons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: scenario.id, comparisonScenarioId: activeScenarioId, metrics, outcomeEquivalent: null, verificationSource: "unverified" }) });
    setHistoryState(response.ok ? "Saved comparison record. Outcome equivalence remains unverified." : "Comparison save failed");
  }

  async function recommend() {
    setRecommendation(null);
    const response = await fetch("/api/v1/recommend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      inputTokens: metricsA.openaiExact,
      outputTokens,
      cachedInputTokens: Math.round(metricsA.openaiExact * cachedPct / 100),
      requestsPerMonth: requestsMonth,
      minimumContextWindow: minimumContextWindow || undefined,
      minimumModelMaxOutput: minimumModelMaxOutput || undefined,
      allowedModelIds: allowedModelIds.length ? allowedModelIds : undefined,
      providers: providerFilter === "all" ? undefined : [providerFilter],
    }) });
    const body = await response.json().catch(() => null);
    if (response.ok) setRecommendation(body as Recommendation);
    else setSaveState(body?.error ?? "No permitted model satisfies the current constraints");
  }

  async function shareScenario() {
    const url = buildShareUrl(window.location.href.split("?")[0], {
      inputTokens: metricsA.openaiExact,
      outputTokens,
      cachedInputTokens: Math.round(metricsA.openaiExact * cachedPct / 100),
      requestsPerMonth: requestsMonth,
      allowedProviders: providerFilter === "all" ? undefined : [providerFilter],
      allowedModels: allowedModelIds.length ? allowedModelIds : undefined,
      maxContextTokens: minimumContextWindow || undefined,
      maxOutputTokens: minimumModelMaxOutput || undefined,
    });
    await navigator.clipboard.writeText(url);
    setSaveState("Copied content-free share link");
  }

  function exportEconomics(format: "json" | "csv") {
    const data = rows.map((row) => ({ model: row.model.id, provider: row.model.provider, promptARequestCostUsd: row.costA, promptBRequestCostUsd: row.costB, deltaUsd: row.delta, promptAMonthlyUsd: monthlyProjection(row.costA, requestsMonth), promptBMonthlyUsd: monthlyProjection(row.costB, requestsMonth), pricingVerifiedAt: row.model.verifiedAt, precision: row.model.tokenizerAccuracy }));
    const text = format === "json" ? JSON.stringify({ scenario: currentScenario, economics: data }, null, 2) : ["model,provider,a_request_usd,b_request_usd,delta_usd,a_monthly_usd,b_monthly_usd,pricing_verified_at,precision", ...data.map((item) => [item.model, item.provider, item.promptARequestCostUsd, item.promptBRequestCostUsd, item.deltaUsd, item.promptAMonthlyUsd, item.promptBMonthlyUsd, item.pricingVerifiedAt, item.precision].join(","))].join("\n");
    const blob = new Blob([text], { type: format === "json" ? "application/json" : "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `token-intelligence-scenario.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const tokenDelta = metricsB.openaiExact - metricsA.openaiExact;
  const pct = metricsA.openaiExact ? tokenDelta / metricsA.openaiExact * 100 : null;

  return <div className="app-stack">
    {replayState ? <section className="app-panel"><div className="app-panel__body"><strong>Run replay:</strong> {replayState}</div></section> : null}
    <section className="app-panel"><div className="app-panel__header"><div><h2>Prompt A / B</h2><p>Both texts are tokenized in your browser. Saving stores economics metadata and SHA-256 hashes—not the prompt text.</p></div></div><div className="app-panel__body">
      <div className="cost-lab-prompts">
        <label className="form-row"><span>Prompt A</span><textarea value={a} onChange={(event) => setA(event.target.value)} placeholder="Paste baseline prompt…" /><small>{metricsA.openaiExact.toLocaleString()} o200k reference tokens · {metricsA.words.toLocaleString()} words</small></label>
        <label className="form-row"><span>Prompt B</span><textarea value={b} onChange={(event) => setB(event.target.value)} placeholder="Paste candidate prompt…" /><small>{metricsB.openaiExact.toLocaleString()} o200k reference tokens · {metricsB.words.toLocaleString()} words</small></label>
      </div>
      <div className="cost-lab-delta"><div><span>Token delta</span><strong>{tokenDelta > 0 ? "+" : ""}{tokenDelta.toLocaleString()}</strong></div><div><span>Relative delta</span><strong>{pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}</strong></div><div><span>Outcome equivalence</span><strong>Not verified</strong></div></div>
    </div></section>

    <section className="app-panel"><div className="app-panel__header"><div><h2>Workload & policy constraints</h2><p>Filter to permitted providers/models and declared context/output needs before asking for the cheapest eligible route.</p></div></div><div className="app-panel__body"><div className="tool-grid tool-grid--3">
      <label>Expected output<input type="number" min="0" value={outputTokens} onChange={(event) => setOutputTokens(Number(event.target.value) || 0)} /></label>
      <label>Cached input %<input type="number" min="0" max="100" value={cachedPct} onChange={(event) => setCachedPct(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} /></label>
      <label>Requests / day<input type="number" min="0" value={requestsDay} onChange={(event) => setRequestsDay(Number(event.target.value) || 0)} /></label>
      <label>Requests / month<input type="number" min="0" value={requestsMonth} onChange={(event) => setRequestsMonth(Number(event.target.value) || 0)} /></label>
      <label>Provider<select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value as ProviderName | "all")}><option value="all">All permitted</option>{(["OpenAI", "Anthropic", "Google", "xAI", "DeepSeek"] as ProviderName[]).map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></label>
      <label>Minimum context window<input type="number" min="0" value={minimumContextWindow} onChange={(event) => setMinimumContextWindow(Number(event.target.value) || 0)} /></label>
      <label>Minimum model max output<input type="number" min="0" value={minimumModelMaxOutput} onChange={(event) => setMinimumModelMaxOutput(Number(event.target.value) || 0)} /></label>
      <label>Allowed model IDs<input value={allowedModelsText} onChange={(event) => setAllowedModelsText(event.target.value)} placeholder="model-a,model-b" /></label>
    </div><div className="form-actions" style={{ marginTop: 12 }}><button className="button button--primary" type="button" onClick={() => void recommend()}>Cheapest permitted model</button><button className="button button--ghost" type="button" onClick={() => void shareScenario()}>Copy share link</button><button className="button button--ghost" type="button" onClick={() => exportEconomics("json")}>Export JSON</button><button className="button button--ghost" type="button" onClick={() => exportEconomics("csv")}>Export CSV</button></div></div></section>

    {recommendation ? <section className="app-panel"><div className="app-panel__header"><div><h2>Recommendation</h2><p>Economics/context recommendation only; quality is not guaranteed without historical or experiment evidence.</p></div></div><div className="app-panel__body"><div className="finding"><div className="finding__top"><h3>{recommendation.data.modelName}</h3><strong>{money(recommendation.data.requestCostUsd)} / request</strong></div><p>{recommendation.data.provider} · {recommendation.data.contextWindow.toLocaleString()} context · {recommendation.data.monthlyCostUsd === null ? "monthly volume not set" : `${money(recommendation.data.monthlyCostUsd)} / month`}</p>{recommendation.constraintsNotEvaluated?.length ? <p><strong>Not evaluated:</strong> {recommendation.constraintsNotEvaluated.join("; ")}</p> : null}<p>{recommendation.warning}</p></div></div></section> : null}

    <section className="app-panel"><div className="app-panel__header"><div><h2>Model-by-model delta</h2><p>Economics only. A lower cost is not treated as a quality win unless the outcome is independently verified.</p></div></div><div className="app-table-wrap"><table className="app-table"><thead><tr><th>Model</th><th>A request</th><th>B request</th><th>Delta</th><th>A monthly</th><th>B monthly</th><th>Precision</th></tr></thead><tbody>{rows.slice(0, 30).map((row) => <tr key={row.model.id}><td><strong>{row.model.name}</strong><br /><small>{row.model.provider}</small></td><td className="mono">{money(row.costA)}</td><td className="mono">{money(row.costB)}</td><td className="mono">{row.delta > 0 ? "+" : ""}{money(row.delta)}</td><td className="mono">{money(monthlyProjection(row.costA, requestsMonth))}</td><td className="mono">{money(monthlyProjection(row.costB, requestsMonth))}</td><td><span className={row.model.tokenizerAccuracy === "estimate" ? "source-badge source-badge--estimated" : "source-badge"}>{row.model.tokenizerAccuracy}</span></td></tr>)}</tbody></table></div></section>

    <section className="app-panel"><div className="app-panel__header"><div><h2>Save scenario</h2><p>Persist assumptions for later comparison without retaining prompt content.</p></div></div><div className="app-panel__body"><div className="scenario-save"><input value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} aria-label="Scenario name" /><button className="button button--primary" type="button" onClick={() => void saveScenario()}>Save scenario</button><span>{saveState}</span></div></div></section>

    <section className="app-panel"><div className="app-panel__header"><div><h2>Scenario history</h2><p>Re-open, duplicate, rename, delete, or create an explicit comparison record. Stored history remains metadata-only.</p></div><button className="button button--ghost" type="button" onClick={() => void loadScenarios()}>Refresh</button></div>{scenarios.length ? <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Name</th><th>Updated</th><th>Actions</th></tr></thead><tbody>{scenarios.map((scenario) => <tr key={scenario.id}><td><strong>{scenario.name}</strong>{activeScenarioId === scenario.id ? <small> · active</small> : null}</td><td>{new Date(scenario.updatedAt).toLocaleString()}</td><td><div className="form-actions"><button className="button button--ghost" type="button" onClick={() => openScenario(scenario)}>Open</button><button className="button button--ghost" type="button" onClick={() => void compareAgainstScenario(scenario)}>Compare current</button><button className="button button--ghost" type="button" onClick={() => void duplicateScenario(scenario)}>Duplicate</button><button className="button button--ghost" type="button" onClick={() => void renameScenario(scenario)}>Rename</button><button className="button button--ghost" type="button" onClick={() => void deleteScenario(scenario)}>Delete</button></div></td></tr>)}</tbody></table></div> : <div className="app-panel__body"><p>No saved scenarios yet.</p></div>}<div className="app-panel__body"><small>{historyState}</small></div></section>
  </div>;
}
