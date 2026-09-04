"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CompactModelComparison } from "@/components/compact-model-comparison";
import { contextHeadroom, parseCalculatorState, serializeCalculatorState, type CalculatorInputMode } from "@/lib/calculator-state";
import { calculateCost } from "@/lib/cost";
import { formatTokens } from "@/lib/format";
import { MODEL_CATALOG, type ModelCatalogEntry } from "@/lib/models";
import { getTokenizerSpec, tokenizerPrecisionLabel } from "@/lib/tokenizers/registry";
import type { TokenMetrics, TokenizerFamily, TokenizerResult } from "@/types/tokenizer";

const TOKENIZER_FAMILIES: TokenizerFamily[] = [
  "openai-o200k",
  "anthropic-estimate",
  "gemini-estimate",
  "deepseek-estimate",
  "grok-estimate",
];

function emptyTokenizerResult(family: TokenizerFamily): TokenizerResult {
  const spec = getTokenizerSpec(family);
  return {
    count: 0,
    pieces: [],
    family,
    precision: spec.precision,
    source: spec.source,
    caveat: spec.caveat,
    piecesTruncated: false,
  };
}

const EMPTY_METRICS: TokenMetrics = {
  requestId: 0,
  characters: 0,
  charactersWithoutSpaces: 0,
  words: 0,
  results: Object.fromEntries(TOKENIZER_FAMILIES.map((family) => [family, emptyTokenizerResult(family)])) as Record<TokenizerFamily, TokenizerResult>,
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

function contextStateLabel(state: ReturnType<typeof contextHeadroom>["state"]) {
  if (state === "overflow") return "Overflow";
  if (state === "near_limit") return "Near limit";
  if (state === "tight") return "Getting tight";
  return "Comfortable";
}

export function TokenCalculator() {
  const currentModels = useMemo(() => MODEL_CATALOG.filter((model) => model.status !== "legacy"), []);
  const defaultModelId = currentModels.find((model) => model.id === "gpt-5.6-sol")?.id ?? currentModels[0]?.id ?? "";

  const [mode, setMode] = useState<CalculatorInputMode>("text");
  const [text, setText] = useState("");
  const [manualWords, setManualWords] = useState(500);
  const [manualTokens, setManualTokens] = useState(1000);
  const [metrics, setMetrics] = useState<TokenMetrics>(EMPTY_METRICS);
  const [outputPercent, setOutputPercent] = useState(35);
  const [cachedPercent, setCachedPercent] = useState(0);
  const [requestsPerMonth, setRequestsPerMonth] = useState(10_000);
  const [selectedModelId, setSelectedModelId] = useState(defaultModelId);
  const [pieceLimit, setPieceLimit] = useState(120);
  const [shareStatus, setShareStatus] = useState("");
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  const selectedModel = currentModels.find((model) => model.id === selectedModelId) ?? currentModels[0];

  useEffect(() => {
    const parsed = parseCalculatorState(window.location.search, {
      mode: "text",
      words: 500,
      tokens: 1000,
      outputPercent: 35,
      cachedPercent: 0,
      requestsPerMonth: 10_000,
      modelId: defaultModelId,
    });
    setMode(parsed.mode);
    setManualWords(parsed.words);
    setManualTokens(parsed.tokens);
    setOutputPercent(parsed.outputPercent);
    setCachedPercent(parsed.cachedPercent);
    setRequestsPerMonth(parsed.requestsPerMonth);
    if (currentModels.some((model) => model.id === parsed.modelId)) setSelectedModelId(parsed.modelId);
  }, [currentModels, defaultModelId]);

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

  useEffect(() => {
    setPieceLimit(120);
  }, [text, selectedModelId]);

  const selectedTokenizerResult = selectedModel ? metrics.results[selectedModel.tokenizer] : metrics.results["openai-o200k"];
  const baseInputTokens = mode === "text"
    ? selectedTokenizerResult.count
    : mode === "words"
      ? estimatedTokensFromWords(manualWords)
      : manualTokens;
  const outputTokens = Math.max(0, Math.round(baseInputTokens * (outputPercent / 100)));

  const inputTokensFor = useCallback((model: ModelCatalogEntry) => {
    if (mode !== "text") return baseInputTokens;
    return metrics.results[model.tokenizer]?.count ?? metrics.results["openai-o200k"].count;
  }, [mode, baseInputTokens, metrics]);

  const lowest = useMemo(() => {
    if (!baseInputTokens) return null;
    return currentModels.map((model) => {
      const inputTokens = inputTokensFor(model);
      const cachedInputTokens = Math.round(inputTokens * (cachedPercent / 100));
      return { model, cost: calculateCost(model, { inputTokens, cachedInputTokens, outputTokens }).total };
    }).sort((a, b) => a.cost - b.cost)[0] ?? null;
  }, [baseInputTokens, cachedPercent, currentModels, inputTokensFor, outputTokens]);

  const selectedContext = selectedModel
    ? contextHeadroom(baseInputTokens, outputTokens, selectedModel.contextWindow)
    : contextHeadroom(0, 0, 0);
  const visiblePieces = selectedTokenizerResult.pieces.slice(0, pieceLimit);
  const hiddenPieceCount = Math.max(selectedTokenizerResult.count - visiblePieces.length, 0);

  async function copyScenarioLink() {
    const query = serializeCalculatorState({
      mode,
      words: manualWords,
      tokens: manualTokens,
      outputPercent,
      cachedPercent,
      requestsPerMonth,
      modelId: selectedModel?.id ?? "",
    }, { textModeTokenCount: baseInputTokens });
    const url = window.location.origin + "/?" + query;
    await navigator.clipboard.writeText(url);
    setShareStatus(mode === "text" ? "Scenario link copied without prompt content." : "Scenario link copied.");
  }

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
            {(["text", "words", "tokens"] as CalculatorInputMode[]).map((item) => <button key={item} className={mode === item ? "mode-tab mode-tab--active" : "mode-tab"} type="button" onClick={() => setMode(item)}>{item === "text" ? "Paste text" : item === "words" ? "Known words" : "Known tokens"}</button>)}
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
            <div className="summary-number"><strong>{mode === "text" && selectedTokenizerResult.precision === "estimated" ? "≈" : ""}{formatTokens(baseInputTokens)}</strong><span>input tokens</span></div>
            <div className="summary-list">
              <div><span>Tokenizer</span><strong>{getTokenizerSpec(selectedTokenizerResult.family).displayName}</strong></div>
              <div><span>Precision</span><strong>{tokenizerPrecisionLabel(selectedTokenizerResult.precision)}</strong></div>
              <div><span>Context used</span><strong>{selectedContext.utilization.toFixed(2)}%</strong></div>
              <div><span>Headroom</span><strong>{selectedContext.remaining >= 0 ? formatTokens(selectedContext.remaining) : "-" + formatTokens(Math.abs(selectedContext.remaining))}</strong></div>
              <div><span>Context state</span><strong>{contextStateLabel(selectedContext.state)}</strong></div>
              <div><span>Lowest current estimate</span><strong>{lowest ? "$" + (lowest.cost < .01 ? lowest.cost.toFixed(4) : lowest.cost.toFixed(3)) : "—"}</strong></div>
            </div>
            <small>{selectedTokenizerResult.caveat}</small>
          </aside>
        </div>

        <div className="metrics-strip metrics-strip--5">
          <div><span>Tokens</span><strong>{mode === "text" && selectedTokenizerResult.precision === "estimated" ? "≈" : ""}{formatTokens(baseInputTokens)}</strong><small>{tokenizerPrecisionLabel(selectedTokenizerResult.precision)}</small></div>
          <div><span>Words</span><strong>{mode === "text" ? formatTokens(metrics.words) : mode === "words" ? formatTokens(manualWords) : "—"}</strong></div>
          <div><span>No-space chars</span><strong>{mode === "text" ? formatTokens(metrics.charactersWithoutSpaces) : "—"}</strong></div>
          <div><span>Characters</span><strong>{mode === "text" ? formatTokens(metrics.characters) : "—"}</strong></div>
          <div><span>Reserved output</span><strong>{formatTokens(outputTokens)}</strong><small>{outputPercent}% assumption</small></div>
        </div>

        <div className="planning-bar">
          <label><span className="field-label">Planning model</span><select aria-label="Planning model" value={selectedModel?.id ?? ""} onChange={(event) => setSelectedModelId(event.target.value)}>{currentModels.map((model) => <option key={model.id} value={model.id}>{model.provider} · {model.name}</option>)}</select></label>
          <div className="planning-bar__output"><div><span className="field-label">Expected response</span><strong>{outputPercent}% of input</strong></div><div className="preset-row">{OUTPUT_PRESETS.map((preset) => <button key={preset.value} type="button" className={outputPercent === preset.value ? "preset preset--active" : "preset"} onClick={() => setOutputPercent(preset.value)}>{preset.label}</button>)}</div><input aria-label="Output token percentage" className="range" type="range" min="0" max="150" step="5" value={outputPercent} onChange={(event) => setOutputPercent(Number(event.target.value))} /></div>
          <label><span className="field-label">Cached input</span><div className="inline-number"><input aria-label="Cached input percentage" type="number" min="0" max="100" value={cachedPercent} onChange={(event) => setCachedPercent(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} /><span>%</span></div></label>
          <label><span className="field-label">Requests / month</span><input aria-label="Requests per month" type="number" min="0" value={requestsPerMonth} onChange={(event) => setRequestsPerMonth(Number(event.target.value) || 0)} /></label>
        </div>

        <div className="form-actions">
          <button type="button" className="button button--ghost" onClick={copyScenarioLink}>Copy scenario link</button>
          {shareStatus ? <span role="status" className="muted">{shareStatus}</span> : null}
        </div>

        {mode === "text" && selectedTokenizerResult.pieces.length > 0 && <details className="token-visualizer"><summary>Inspect token boundaries <span>showing {visiblePieces.length} of {formatTokens(selectedTokenizerResult.count)}</span></summary><div className="token-cloud">{visiblePieces.map((piece, index) => <span key={String(piece.id ?? "piece") + "-" + index} title={piece.id === undefined ? "Token piece" : "Token " + piece.id} className={"token-chip token-chip--" + (index % 5)}>{piece.text.replace(/ /g, "·").replace(/\n/g, "↵") || "∅"}</span>)}</div>{hiddenPieceCount > 0 ? <div className="form-actions"><span className="muted">{hiddenPieceCount.toLocaleString()} token pieces are not rendered to keep the page responsive.</span>{pieceLimit < selectedTokenizerResult.pieces.length ? <button className="button button--ghost" type="button" onClick={() => setPieceLimit(300)}>Show up to 300</button> : null}</div> : null}</details>}
        {mode === "text" && selectedTokenizerResult.pieces.length === 0 && baseInputTokens > 0 ? <p className="table-note">Token-piece inspection is unavailable for this estimated tokenizer. Switch to an OpenAI o200k reference model to inspect local token boundaries.</p> : null}
      </section>

      <div className="shell"><CompactModelComparison inputTokensFor={inputTokensFor} outputTokens={outputTokens} cachedPercent={cachedPercent} requestsPerMonth={requestsPerMonth} /></div>

      <section className="tools-section shell"><div className="section-heading"><div><p className="eyebrow">Planning suite</p><h2>Move from counting to decisions.</h2><p>Use the same model/pricing foundation for workload economics, context scale, infrastructure memory and latency.</p></div></div><div className="tool-link-grid">{toolLinks.map((tool) => <Link key={tool.href} href={tool.href} className="tool-link"><p className="eyebrow">{tool.eyebrow}</p><h3>{tool.title}</h3><p>{tool.body}</p><span>Open →</span></Link>)}</div></section>

      <section className="trust shell"><div><p className="eyebrow">From calculator to control plane</p><h2>Private by default. More observability only when you opt in.</h2></div><div className="trust-grid"><div><strong>01</strong><h3>Estimate locally</h3><p>The public calculator tokenizes text in a browser worker. No account and no prompt upload are required.</p></div><div><strong>02</strong><h3>Trace metadata</h3><p>Collectors can send run IDs, models, tokens, tool metadata and outcomes without uploading prompt or source content.</p></div><div><strong>03</strong><h3>Enforce deliberately</h3><p>Hard budget/model policy only applies on traffic that actually passes through an instrumented gateway or supported provider path.</p></div></div></section>

      <footer className="footer shell"><span>Token Intelligence · AI workload economics</span><span>Calculator free · Agent observability optional</span></footer>
    </main>
  );
}
