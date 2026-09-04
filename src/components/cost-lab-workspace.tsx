"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { calculateCost, monthlyProjection } from "@/lib/cost";
import { MODEL_CATALOG } from "@/lib/models";
import { getTokenizerSpec, TOKENIZER_REGISTRY, tokenizerPrecisionLabel } from "@/lib/tokenizers/registry";
import type { TokenMetrics, TokenizerFamily, TokenizerResult } from "@/types/tokenizer";

const EMPTY: TokenMetrics = {
  requestId: 0,
  characters: 0,
  charactersWithoutSpaces: 0,
  words: 0,
  results: Object.fromEntries(Object.keys(TOKENIZER_REGISTRY).map((family) => {
    const typedFamily = family as TokenizerFamily;
    const spec = getTokenizerSpec(typedFamily);
    const result: TokenizerResult = { count: 0, pieces: [], family: typedFamily, precision: spec.precision, source: spec.source, caveat: spec.caveat, piecesTruncated: false };
    return [typedFamily, result];
  })) as Record<TokenizerFamily, TokenizerResult>,
};

function money(value: number) {
  return `$${value < .01 ? value.toFixed(4) : value.toFixed(2)}`;
}

async function hashText(text: string) {
  if (!text) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function CostLabWorkspace() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [metricsA, setMetricsA] = useState(EMPTY);
  const [metricsB, setMetricsB] = useState(EMPTY);
  const [outputTokens, setOutputTokens] = useState(1000);
  const [cachedPct, setCachedPct] = useState(0);
  const [requestsMonth, setRequestsMonth] = useState(10_000);
  const [scenarioName, setScenarioName] = useState("Prompt comparison");
  const [saveState, setSaveState] = useState<string | null>(null);
  const workerA = useRef<Worker | null>(null);
  const workerB = useRef<Worker | null>(null);
  const idA = useRef(0);
  const idB = useRef(0);

  useEffect(() => {
    const first = new Worker(new URL("../workers/tokenizer.worker.ts", import.meta.url));
    const second = new Worker(new URL("../workers/tokenizer.worker.ts", import.meta.url));
    workerA.current = first;
    workerB.current = second;
    first.onmessage = (event: MessageEvent<TokenMetrics>) => { if (event.data.requestId === idA.current) setMetricsA(event.data); };
    second.onmessage = (event: MessageEvent<TokenMetrics>) => { if (event.data.requestId === idB.current) setMetricsB(event.data); };
    return () => { first.terminate(); second.terminate(); };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => { idA.current += 1; workerA.current?.postMessage({ requestId: idA.current, text: a }); }, 100);
    return () => window.clearTimeout(timeout);
  }, [a]);
  useEffect(() => {
    const timeout = window.setTimeout(() => { idB.current += 1; workerB.current?.postMessage({ requestId: idB.current, text: b }); }, 100);
    return () => window.clearTimeout(timeout);
  }, [b]);

  const rows = useMemo(() => MODEL_CATALOG.filter((model) => model.status !== "legacy").map((model) => {
    const inputA = metricsA.results[model.tokenizer]?.count ?? 0;
    const inputB = metricsB.results[model.tokenizer]?.count ?? 0;
    const costA = calculateCost(model, { inputTokens: inputA, cachedInputTokens: Math.round(inputA * cachedPct / 100), outputTokens }).total;
    const costB = calculateCost(model, { inputTokens: inputB, cachedInputTokens: Math.round(inputB * cachedPct / 100), outputTokens }).total;
    return { model, inputA, inputB, costA, costB, delta: costB - costA };
  }).sort((x, y) => Math.min(x.costA, x.costB) - Math.min(y.costA, y.costB)), [cachedPct, metricsA, metricsB, outputTokens]);

  async function saveScenario() {
    setSaveState("Saving…");
    const [promptHashA, promptHashB] = await Promise.all([hashText(a), hashText(b)]);
    const response = await fetch("/api/v1/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: scenarioName,
        promptHashA,
        promptHashB,
        scenario: {
          inputTokensA: metricsA.results["openai-o200k"].count,
          inputTokensB: metricsB.results["openai-o200k"].count,
          wordsA: metricsA.words,
          wordsB: metricsB.words,
          outputTokens,
          cachedPercent: cachedPct,
          requestsPerMonth: requestsMonth,
          tokenizerReference: "o200k",
          promptContentStored: false,
          createdFrom: "cost_lab_2",
        },
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaveState(response.ok ? "Saved metadata only" : (body.error ?? "Save failed"));
  }

  const tokenDelta = metricsB.results["openai-o200k"].count - metricsA.results["openai-o200k"].count;
  const pct = metricsA.results["openai-o200k"].count ? tokenDelta / metricsA.results["openai-o200k"].count * 100 : null;

  return <div className="app-stack">
    <section className="app-panel"><div className="app-panel__header"><div><h2>Prompt A / B</h2><p>Both texts are tokenized in your browser. Saving stores economics metadata and SHA-256 hashes—not the prompt text.</p></div></div><div className="app-panel__body">
      <div className="cost-lab-prompts">
        <label className="form-row"><span>Prompt A</span><textarea value={a} onChange={(event) => setA(event.target.value)} placeholder="Paste baseline prompt…" /><small>{metricsA.results["openai-o200k"].count.toLocaleString()} o200k reference tokens · {metricsA.words.toLocaleString()} words</small></label>
        <label className="form-row"><span>Prompt B</span><textarea value={b} onChange={(event) => setB(event.target.value)} placeholder="Paste candidate prompt…" /><small>{metricsB.results["openai-o200k"].count.toLocaleString()} o200k reference tokens · {metricsB.words.toLocaleString()} words</small></label>
      </div>
      <div className="cost-lab-delta"><div><span>Token delta</span><strong>{tokenDelta > 0 ? "+" : ""}{tokenDelta.toLocaleString()}</strong></div><div><span>Relative delta</span><strong>{pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}</strong></div><div><span>Outcome equivalence</span><strong>Not verified</strong></div></div>
    </div></section>

    <section className="app-panel"><div className="app-panel__header"><div><h2>Workload assumptions</h2><p>Change output, caching and request volume once; compare all current model profiles below.</p></div></div><div className="app-panel__body"><div className="tool-grid tool-grid--3"><label>Expected output<input type="number" min="0" value={outputTokens} onChange={(event) => setOutputTokens(Number(event.target.value) || 0)} /></label><label>Cached input %<input type="number" min="0" max="100" value={cachedPct} onChange={(event) => setCachedPct(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} /></label><label>Requests / month<input type="number" min="0" value={requestsMonth} onChange={(event) => setRequestsMonth(Number(event.target.value) || 0)} /></label></div></div></section>

    <section className="app-panel"><div className="app-panel__header"><div><h2>Model-by-model delta</h2><p>Economics only. A lower cost is not treated as a quality win unless the outcome is independently verified.</p></div></div><div className="app-table-wrap"><table className="app-table"><thead><tr><th>Model</th><th>A request</th><th>B request</th><th>Delta</th><th>A monthly</th><th>B monthly</th><th>Precision</th></tr></thead><tbody>{rows.slice(0, 14).map((row) => <tr key={row.model.id}><td><strong>{row.model.name}</strong><br /><small>{row.model.provider}</small></td><td className="mono">{money(row.costA)}</td><td className="mono">{money(row.costB)}</td><td className="mono">{row.delta > 0 ? "+" : ""}{money(row.delta)}</td><td className="mono">{money(monthlyProjection(row.costA, requestsMonth))}</td><td className="mono">{money(monthlyProjection(row.costB, requestsMonth))}</td><td><span className={getTokenizerSpec(row.model.tokenizer).precision === "estimated" ? "source-badge source-badge--estimated" : "source-badge"}>{tokenizerPrecisionLabel(getTokenizerSpec(row.model.tokenizer).precision)}</span></td></tr>)}</tbody></table></div></section>

    <section className="app-panel"><div className="app-panel__header"><div><h2>Save scenario</h2><p>Persist the assumptions for later comparison without retaining prompt content.</p></div></div><div className="app-panel__body"><div className="scenario-save"><input value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} aria-label="Scenario name" /><button className="button button--primary" type="button" onClick={saveScenario}>Save scenario</button><span>{saveState}</span></div></div></section>
  </div>;
}
