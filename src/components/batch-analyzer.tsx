"use client";

import { useMemo, useState } from "react";
import { analyzeBatchTextFiles, BATCH_ALLOWED_EXTENSIONS, BATCH_MAX_FILE_BYTES, BATCH_MAX_FILES, type BatchFileAnalysis } from "@/lib/planning/batch-analysis";
import { MODEL_CATALOG } from "@/lib/models";

type Result = ReturnType<typeof analyzeBatchTextFiles>;

export function BatchAnalyzer() {
  const currentModels = useMemo(() => MODEL_CATALOG.filter((model) => model.status !== "legacy"), []);
  const [modelId, setModelId] = useState(currentModels[0]?.id ?? "");
  const [outputTokens, setOutputTokens] = useState(1000);
  const [cachedInputPct, setCachedInputPct] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function analyze(files: FileList | null) {
    if (!files?.length) { setResult(null); return; }
    setBusy(true); setMessage("Reading files locally in your browser…");
    try {
      if (files.length > BATCH_MAX_FILES) throw new Error(`Choose at most ${BATCH_MAX_FILES} files.`);
      const inputs = await Promise.all(Array.from(files).map(async (file) => ({ name: file.name, text: await file.text(), sizeBytes: file.size })));
      const next = analyzeBatchTextFiles(inputs, { modelId, outputTokens, cachedInputPct });
      setResult(next);
      setMessage(`Analyzed ${next.rows.length} files locally. No file contents were uploaded.`);
    } catch (error) {
      setResult(null);
      setMessage(error instanceof Error ? error.message : "Batch analysis failed.");
    } finally { setBusy(false); }
  }

  function money(value: number | null) { return value === null ? "Unknown" : `$${value < 0.01 ? value.toFixed(4) : value.toFixed(2)}`; }
  function compact(value: number) { return new Intl.NumberFormat("en", { notation: value >= 1_000_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value); }

  return <section className="tool-card tool-card--wide">
    <div className="tool-grid tool-grid--3">
      <label>Model<select value={modelId} onChange={(event) => { setModelId(event.target.value); setResult(null); }}>{currentModels.map((model) => <option value={model.id} key={model.id}>{model.provider} · {model.name}</option>)}</select></label>
      <label>Expected output / file<input type="number" min="0" value={outputTokens} onChange={(event) => { setOutputTokens(Number(event.target.value) || 0); setResult(null); }} /></label>
      <label>Cached input %<input type="number" min="0" max="100" value={cachedInputPct} onChange={(event) => { setCachedInputPct(Math.min(100, Math.max(0, Number(event.target.value) || 0))); setResult(null); }} /></label>
    </div>
    <label className="form-row" style={{ marginTop: 18 }}><span>Text-like files</span><input type="file" multiple accept={BATCH_ALLOWED_EXTENSIONS.join(",")} onChange={(event) => void analyze(event.target.files)} disabled={busy} /><small>{BATCH_ALLOWED_EXTENSIONS.join(", ")} · maximum {(BATCH_MAX_FILE_BYTES / 1_000_000).toFixed(0)} MB per file · {BATCH_MAX_FILES} files. Processing stays in this browser.</small></label>
    <p role="status" className="muted">{message}</p>
    {result ? <>
      <div className="metric-strip"><div><span>Files</span><strong>{result.totals.files}</strong></div><div><span>Reference tokens</span><strong>{compact(result.totals.referenceTokens)}</strong></div><div><span>Words</span><strong>{compact(result.totals.words)}</strong></div><div><span>Estimated batch cost</span><strong>{money(result.totals.estimatedRequestCostUsd)}</strong></div></div>
      <div className="table-wrap"><table className="pricing-table"><thead><tr><th>File</th><th>Characters</th><th>Words</th><th>Reference tokens</th><th>Anthropic est.</th><th>Gemini est.</th><th>Context</th><th>Request cost</th></tr></thead><tbody>{result.rows.map((row: BatchFileAnalysis) => <tr key={row.name}><td><strong>{row.name}</strong></td><td>{compact(row.characters)}</td><td>{compact(row.words)}</td><td>{compact(row.referenceTokens)}</td><td>{compact(row.anthropicEstimatedTokens)}</td><td>{compact(row.geminiEstimatedTokens)}</td><td>{row.fitsContext ? `${row.contextUtilizationPct.toFixed(1)}%` : "Does not fit"}</td><td>{money(row.estimatedRequestCostUsd)}</td></tr>)}</tbody></table></div>
      <p className="muted">Precision: local OpenAI o200k reference plus clearly labeled provider estimates. This tool does not claim provider-measured usage.</p>
    </> : null}
  </section>;
}
