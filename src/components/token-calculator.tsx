"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatTokens } from "@/lib/format";
import { MODEL_CATALOG, PROVIDERS, modelsByProvider, type ModelCatalogEntry } from "@/lib/models";
import type { TokenMetrics } from "@/types/tokenizer";
import { ProviderCard } from "@/components/provider-card";

type InputMode = "text" | "words" | "tokens";

const EMPTY_METRICS: TokenMetrics = {
  requestId: 0,
  characters: 0,
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

function estimatedTokensFromWords(words: number) {
  return Math.max(0, Math.ceil(words / 0.75));
}

export function TokenCalculator() {
  const [mode, setMode] = useState<InputMode>("text");
  const [text, setText] = useState("Design an agentic support workflow that summarizes a customer ticket, retrieves the account context, proposes the next best action, and drafts a concise response.");
  const [manualWords, setManualWords] = useState(500);
  const [manualTokens, setManualTokens] = useState(1000);
  const [metrics, setMetrics] = useState<TokenMetrics>(EMPTY_METRICS);
  const [outputPercent, setOutputPercent] = useState(35);
  const [cachedPercent, setCachedPercent] = useState(0);
  const [requestsPerMonth, setRequestsPerMonth] = useState(10_000);
  const [sortMode, setSortMode] = useState<"provider" | "cost">("provider");
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

  const providerOrder = useMemo(() => {
    if (sortMode === "provider") return PROVIDERS;
    return [...PROVIDERS].sort((a, b) => {
      const aModel = modelsByProvider(a)[0];
      const bModel = modelsByProvider(b)[0];
      const aRate = aModel.pricing.input + aModel.pricing.output * (outputPercent / 100);
      const bRate = bModel.pricing.input + bModel.pricing.output * (outputPercent / 100);
      return aRate - bRate;
    });
  }, [sortMode, outputPercent]);

  const tokenPieces = metrics.pieces.slice(0, 120);

  return (
    <main>
      <section className="hero shell">
        <div className="hero__copy">
          <span className="pill">Local-first · no prompt upload</span>
          <h1>Know the token cost <span>before</span> you ship.</h1>
          <p>Count tokens, compare current model pricing, check context usage, and forecast monthly LLM spend from one private browser workspace.</p>
        </div>
        <div className="hero__status"><span className="status-dot" />Pricing catalog verified 2026-08-30</div>
      </section>

      <section className="workspace shell" aria-label="Token calculator workspace">
        <div className="mode-tabs" role="tablist" aria-label="Input mode">
          {(["text", "words", "tokens"] as InputMode[]).map((item) => (
            <button key={item} className={mode === item ? "mode-tab mode-tab--active" : "mode-tab"} type="button" onClick={() => setMode(item)}>
              {item === "text" ? "Text input" : item === "words" ? "Word count" : "Token count"}
            </button>
          ))}
        </div>

        <div className="input-panel">
          {mode === "text" && (
            <>
              <div className="input-panel__header"><label htmlFor="prompt">Prompt / context</label><button type="button" className="text-button" onClick={() => setText("")}>Clear text</button></div>
              <textarea id="prompt" value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
            </>
          )}
          {mode === "words" && (
            <label className="number-input-block" htmlFor="word-count">
              <span>Total words</span>
              <input id="word-count" type="number" min="0" value={manualWords} onChange={(event) => setManualWords(Number(event.target.value) || 0)} />
              <small>Uses the planning heuristic 1 token ≈ 0.75 English words. Provider cards are marked as estimates.</small>
            </label>
          )}
          {mode === "tokens" && (
            <label className="number-input-block" htmlFor="token-count">
              <span>Total input tokens</span>
              <input id="token-count" type="number" min="0" value={manualTokens} onChange={(event) => setManualTokens(Number(event.target.value) || 0)} />
              <small>Use this mode when your provider or telemetry already gives you the exact input-token count.</small>
            </label>
          )}

          <div className="metrics-strip">
            <div><span>Characters</span><strong>{mode === "text" ? formatTokens(metrics.characters) : "—"}</strong></div>
            <div><span>Words</span><strong>{mode === "text" ? formatTokens(metrics.words) : mode === "words" ? formatTokens(manualWords) : "—"}</strong></div>
            <div><span>Input tokens</span><strong>{formatTokens(baseInputTokens)}</strong><small>{mode === "text" ? "OpenAI o200k reference" : "planning input"}</small></div>
            <div><span>Output tokens</span><strong>{formatTokens(outputTokens)}</strong><small>{outputPercent}% of input</small></div>
          </div>
        </div>

        {mode === "text" && tokenPieces.length > 0 && (
          <details className="token-visualizer">
            <summary>Inspect token boundaries <span>first {tokenPieces.length} OpenAI o200k tokens</span></summary>
            <div className="token-cloud">
              {tokenPieces.map((piece, index) => <span key={`${piece.id}-${index}`} title={`Token ${piece.id}`} className={`token-chip token-chip--${index % 5}`}>{piece.text.replace(/ /g, "·").replace(/\n/g, "↵") || "∅"}</span>)}
            </div>
          </details>
        )}

        <div className="planner-grid">
          <div className="planner-card planner-card--wide">
            <div className="planner-card__heading"><div><p className="eyebrow">Output planning</p><h2>Expected response size</h2></div><strong>{outputPercent}%</strong></div>
            <div className="preset-row">{OUTPUT_PRESETS.map((preset) => <button key={preset.value} type="button" className={outputPercent === preset.value ? "preset preset--active" : "preset"} onClick={() => setOutputPercent(preset.value)}>{preset.label}</button>)}</div>
            <input aria-label="Output token percentage" className="range" type="range" min="0" max="150" step="5" value={outputPercent} onChange={(event) => setOutputPercent(Number(event.target.value))} />
          </div>

          <div className="planner-card">
            <label htmlFor="cached-percent"><span className="eyebrow">Prompt caching</span><strong>Cached input</strong></label>
            <div className="inline-number"><input id="cached-percent" type="number" min="0" max="100" value={cachedPercent} onChange={(event) => setCachedPercent(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} /><span>%</span></div>
            <small>Applied only to models with a published cached-input rate.</small>
          </div>

          <div className="planner-card">
            <label htmlFor="monthly-requests"><span className="eyebrow">Budget forecast</span><strong>Requests / month</strong></label>
            <input id="monthly-requests" type="number" min="0" value={requestsPerMonth} onChange={(event) => setRequestsPerMonth(Number(event.target.value) || 0)} />
            <small>Provider cards show an estimated monthly spend at this volume.</small>
          </div>
        </div>
      </section>

      <section className="comparison shell">
        <div className="section-heading">
          <div><p className="eyebrow">Cost intelligence</p><h2>Compare by provider</h2><p>Rates are USD per million tokens. Tokenizer precision is shown on every card.</p></div>
          <label className="sort-control">Sort <select value={sortMode} onChange={(event) => setSortMode(event.target.value as "provider" | "cost")}><option value="provider">Provider</option><option value="cost">Lowest base cost</option></select></label>
        </div>
        <div className="provider-grid">
          {providerOrder.map((provider) => <ProviderCard key={provider} provider={provider} models={modelsByProvider(provider)} inputTokensFor={inputTokensFor} outputTokens={outputTokens} cachedPercent={cachedPercent} requestsPerMonth={requestsPerMonth} />)}
        </div>
      </section>

      <section className="trust shell">
        <div><p className="eyebrow">Privacy architecture</p><h2>Your prompt stays in the browser.</h2></div>
        <div className="trust-grid">
          <div><strong>01</strong><h3>Local tokenization</h3><p>Text is sent only to a Web Worker in this page. There is no prompt-analysis API route.</p></div>
          <div><strong>02</strong><h3>Honest precision</h3><p>OpenAI o200k is calculated locally. Other provider families are clearly labeled estimates until an official compatible local tokenizer is available.</p></div>
          <div><strong>03</strong><h3>Versioned pricing</h3><p>Every model entry includes a provider source and verification date so stale pricing is visible and auditable.</p></div>
        </div>
      </section>

      <footer className="footer shell"><span>Token Intelligence · clean-room implementation</span><span>{MODEL_CATALOG.length} pricing profiles · no account required</span></footer>
    </main>
  );
}
