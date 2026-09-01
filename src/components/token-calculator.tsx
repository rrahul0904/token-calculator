"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CompactModelComparison } from "@/components/compact-model-comparison";
import { calculateCost } from "@/lib/cost";
import { formatTokens } from "@/lib/format";
import { MODEL_CATALOG, type ModelCatalogEntry } from "@/lib/models";
import type { TokenMetrics } from "@/types/tokenizer";

type InputMode = "text" | "words" | "tokens";

const EMPTY_METRICS: TokenMetrics = {
  requestId: 0,
  characters: 0,
  charactersWithoutSpaces: 0,
  words: 0,
  openaiExact: 0,
  anthropicEstimate: 0,
  geminiEstimate: 0,
  deepseekEstimate: 0,
  grokEstimate: 0,
  pieces: [],
};

const OUTPUT_PRESETS = [
  { label: "Classification", value: 5 },
  { label: "RAG / Q&A", value: 15 },
  { label: "Chat", value: 35 },
  { label: "Full response", value: 60 },
  { label: "Long generation", value: 100 },
];

const toolLinks = [
  { href: "/tools/cost", eyebrow: "Economics", title: "Cost Lab", body: "Compare model, context, cache and volume assumptions in one workspace." },
  { href: "/tools/tokens-words", eyebrow: "Sizing", title: "Tokens ↔ words", body: "Translate token budgets into a human-readable document scale." },
  { href: "/tools/memory", eyebrow: "Infrastructure", title: "GPU memory", body: "Estimate model-weight VRAM from parameters and precision." },
  { href: "/tools/speed", eyebrow: "Latency", title: "Speed simulator", body: "Separate time-to-first-token from streamed decode time." },
];

function estimatedTokensFromWords(words: number) {
  return Math.max(0, Math.ceil(words / 0.75));
}

export function TokenCalculator() {
  const [mode, setMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [manualWords, setManualWords] = useState(500);
  const [manualTokens, setManualTokens] = useState(1000);
  const [metrics, setMetrics] = useState<TokenMetrics>(EMPTY_METRICS);
  const [outputPercent, setOutputPercent] = useState(35);
  const [cachedPercent, setCachedPercent] = useState(0);
  const [requestsPerMonth, setRequestsPerMonth] = useState(10_000);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/tokenizer.worker.ts", import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<TokenMetrics>) => {
      if (event.data.requestId === requestIdRef.current) setMetrics(event.data);
    };
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    if (mode !== "text" || !workerRef.current) return;
    const timer = window.setTimeout(() => {
      requestIdRef.current += 1;
      workerRef.current?.postMessage({ requestId: requestIdRef.current, text });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [text, mode]);

  const baseInputTokens = mode === "text" ? metrics.openaiExact : mode === "words" ? estimatedTokensFromWords(manualWords) : manualTokens;
  const outputTokens = Math.max(0, Math.round(baseInputTokens * (outputPercent / 100)));
  const inputTokensFor = useCallback((model: ModelCatalogEntry) => {
    if (mode !== "text") return baseInputTokens;
    switch (model.tokenizer) {
      case "openai-o200k": return metrics.openaiExact;
      case "anthropic-estimate": return metrics.anthropicEstimate;
      case "gemini-estimate": return metrics.geminiEstimate;
      case "deepseek-estimate": return metrics.deepseekEstimate;
      case "grok-estimate": return metrics.grokEstimate;
      default: return metrics.openaiExact;
    }
  }, [mode, baseInputTokens, metrics]);

  const currentModels = useMemo(() => MODEL_CATALOG.filter((model) => model.status !== "legacy"), []);
  const lowest = useMemo(() => {
    if (!baseInputTokens) return null;
    return currentModels.map((model) => {
      const inputTokens = inputTokensFor(model);
      const cachedInputTokens = Math.round(inputTokens * (cachedPercent / 100));
      return { model, cost: calculateCost(model, { inputTokens, cachedInputTokens, outputTokens }).total };
    }).sort((a, b) => a.cost - b.cost)[0] ?? null;
  }, [baseInputTokens, cachedPercent, currentModels, inputTokensFor, outputTokens]);

  const tokenPieces = metrics.pieces.slice(0, 120);
  const contextPct = baseInputTokens ? ((baseInputTokens + outputTokens) / 1_000_000) * 100 : 0;

  return (
    <main>
      <section className="hero hero--commercial shell">
        <div className="hero__copy">
          <span className="pill">Local-first token intelligence</span>
          <h1>Know what your AI workload costs <span>before</span> it runs.</h1>
          <p>Measure context locally, compare current model economics, forecast recurring spend, then connect real agent runs when you need observability and control.</p>
          <div className="hero-actions"><a href="#calculator" className="button button--primary">Calculate now</a><Link href="/app/overview" className="button button--ghost">Open Agent Economics</Link></div>
        </div>
        <div className="hero-proof" aria-label="Product principles">
          <div><strong>Browser-local</strong><span>Prompt tokenization</span></div>
          <div><strong>{MODEL_CATALOG.length}</strong><span>Versioned model profiles</span></div>
          <div><strong>No account</strong><span>Required for calculator</span></div>
        </div>
      </section>

      <section id="calculator" className="calculator-shell shell" aria-label="Token calculator">
        <div className="calculator-shell__top">
          <div className="mode-tabs" role="tablist" aria-label="Input mode">
            {(["text", "words", "tokens"] as InputMode[]).map((item) => <button key={item} className={mode === item ? "mode-tab mode-tab--active" : "mode-tab"} type="button" onClick={() => setMode(item)}>{item === "text" ? "Paste text" : item === "words" ? "Known words" : "Known tokens"}</button>)}
          </div>
          <span className="privacy-inline"><span className="status-dot" />Text stays in this browser</span>
        </div>

        <div className="calculator-primary">
          <div className="calculator-editor">
            {mode === "text" && <><div className="input-panel__header"><label htmlFor="prompt">Prompt, context, document or code</label><button type="button" className="text-button" onClick={() => setText("")}>Clear</button></div><textarea id="prompt" value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} placeholder="Paste content here. It is tokenized locally in a browser worker and is not sent to our server." /></>}
            {mode === "words" && <label className="number-input-block" htmlFor="word-count"><span>Total words</span><input id="word-count" type="number" min="0" value={manualWords} onChange={(event) => setManualWords(Number(event.target.value) || 0)} /><small>Planning heuristic: about 0.75 English words per token.</small></label>}
            {mode === "tokens" && <label className="number-input-block" htmlFor="token-count"><span>Total input tokens</span><input id="token-count" type="number" min="0" value={manualTokens} onChange={(event) => setManualTokens(Number(event.target.value) || 0)} /><small>Use provider telemetry when you already know the input-token count.</small></label>}
          </div>

          <aside className="calculator-summary">
            <span className="app-kicker">Workload snapshot</span>
            <div className="summary-number"><strong>{formatTokens(baseInputTokens)}</strong><span>input tokens</span></div>
            <div className="summary-list">
              <div><span>Planned output</span><strong>{formatTokens(outputTokens)}</strong></div>
              <div><span>Reference context</span><strong>{contextPct.toFixed(2)}%</strong></div>
              <div><span>Lowest current estimate</span><strong>{lowest ? `$${lowest.cost < .01 ? lowest.cost.toFixed(4) : lowest.cost.toFixed(3)}` : "—"}</strong></div>
              <div><span>Lowest model</span><strong>{lowest?.model.name ?? "—"}</strong></div>
            </div>
            <small>“Lowest” compares economics for declared workload assumptions. It does not claim equal model quality.</small>
          </aside>
        </div>

        <div className="metrics-strip metrics-strip--5">
          <div><span>Tokens</span><strong>{formatTokens(baseInputTokens)}</strong><small>{mode === "text" ? "o200k reference" : "planning input"}</small></div>
          <div><span>Words</span><strong>{mode === "text" ? formatTokens(metrics.words) : mode === "words" ? formatTokens(manualWords) : "—"}</strong></div>
          <div><span>No-space chars</span><strong>{mode === "text" ? formatTokens(metrics.charactersWithoutSpaces) : "—"}</strong></div>
          <div><span>Characters</span><strong>{mode === "text" ? formatTokens(metrics.characters) : "—"}</strong></div>
          <div><span>Output</span><strong>{formatTokens(outputTokens)}</strong><small>{outputPercent}% assumption</small></div>
        </div>

        <div className="planning-bar">
          <div className="planning-bar__output"><div><span className="field-label">Expected response</span><strong>{outputPercent}% of input</strong></div><div className="preset-row">{OUTPUT_PRESETS.map((preset) => <button key={preset.value} type="button" className={outputPercent === preset.value ? "preset preset--active" : "preset"} onClick={() => setOutputPercent(preset.value)}>{preset.label}</button>)}</div><input aria-label="Output token percentage" className="range" type="range" min="0" max="150" step="5" value={outputPercent} onChange={(event) => setOutputPercent(Number(event.target.value))} /></div>
          <label><span className="field-label">Cached input</span><div className="inline-number"><input type="number" min="0" max="100" value={cachedPercent} onChange={(event) => setCachedPercent(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} /><span>%</span></div></label>
          <label><span className="field-label">Requests / month</span><input type="number" min="0" value={requestsPerMonth} onChange={(event) => setRequestsPerMonth(Number(event.target.value) || 0)} /></label>
        </div>

        {mode === "text" && tokenPieces.length > 0 && <details className="token-visualizer"><summary>Inspect token boundaries <span>first {tokenPieces.length} o200k reference pieces</span></summary><div className="token-cloud">{tokenPieces.map((piece, index) => <span key={`${piece.id}-${index}`} title={`Token ${piece.id}`} className={`token-chip token-chip--${index % 5}`}>{piece.text.replace(/ /g, "·").replace(/\n/g, "↵") || "∅"}</span>)}</div></details>}
      </section>

      <div className="shell"><CompactModelComparison inputTokensFor={inputTokensFor} outputTokens={outputTokens} cachedPercent={cachedPercent} requestsPerMonth={requestsPerMonth} /></div>

      <section className="tools-section shell"><div className="section-heading"><div><p className="eyebrow">Planning suite</p><h2>Move from counting to decisions.</h2><p>Use the same model/pricing foundation for workload economics, context scale, infrastructure memory and latency.</p></div></div><div className="tool-link-grid">{toolLinks.map((tool) => <Link key={tool.href} href={tool.href} className="tool-link"><p className="eyebrow">{tool.eyebrow}</p><h3>{tool.title}</h3><p>{tool.body}</p><span>Open →</span></Link>)}</div></section>

      <section className="trust shell"><div><p className="eyebrow">From calculator to control plane</p><h2>Private by default. More observability only when you opt in.</h2></div><div className="trust-grid"><div><strong>01</strong><h3>Estimate locally</h3><p>The public calculator tokenizes text in a browser worker. No account and no prompt upload are required.</p></div><div><strong>02</strong><h3>Trace metadata</h3><p>Collectors can send run IDs, models, tokens, tool metadata and outcomes without uploading prompt or source content.</p></div><div><strong>03</strong><h3>Enforce deliberately</h3><p>Hard budget/model policy only applies on traffic that actually passes through an instrumented gateway or supported provider path.</p></div></div></section>

      <footer className="footer shell"><span>Token Intelligence · AI workload economics</span><span>Calculator free · Agent observability optional</span></footer>
    </main>
  );
}
