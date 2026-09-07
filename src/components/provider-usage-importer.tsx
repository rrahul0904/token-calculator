"use client";

import { useState } from "react";

type Preview = {
  sourceHash: string;
  sourceIdentity: string;
  format: "csv" | "json";
  rowCount: number;
  validRows: Array<{ provider: string; periodStart: string; periodEnd: string; costUsd: number | null; model: string | null; runId: string | null; tokens: number | null }>;
  errors: Array<{ row: number; message: string }>;
  totalCostUsd: number | null;
  attribution: { runAttributedCostUsd: number; unattributedCostUsd: number | null; runAttributionCoveragePct: number | null };
};

export function ProviderUsageImporter() {
  const [sourceIdentity, setSourceIdentity] = useState("");
  const [provider, setProvider] = useState("");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(commit: boolean) {
    setBusy(true); setMessage(commit ? "Committing validated import…" : "Previewing import…");
    try {
      const response = await fetch("/api/v1/provider-usage-imports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceIdentity: sourceIdentity || `manual.${format}`, provider: provider || undefined, format, text, commit }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Import failed");
      if (!commit) setPreview(body.data as Preview);
      else { setMessage(`Committed import ${body?.data?.importId}. Raw file content was not stored.`); setText(""); setPreview(null); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Import failed"); }
    finally { setBusy(false); }
  }

  return <section className="app-panel">
    <div className="app-panel__header"><div><h2>Provider usage import</h2><p>Preview CSV/JSON provider exports before commit. The imported rows retain economic attribution fields; the raw file is not stored.</p></div></div>
    <div className="app-panel__body app-stack">
      <div className="form-grid">
        <div className="form-row"><label htmlFor="usage-source">Source name</label><input id="usage-source" value={sourceIdentity} onChange={(event) => setSourceIdentity(event.target.value)} placeholder="openai-august.csv" /></div>
        <div className="form-row"><label htmlFor="usage-provider">Provider hint</label><input id="usage-provider" value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="openai" /></div>
        <div className="form-row"><label htmlFor="usage-format">Format</label><select id="usage-format" value={format} onChange={(event) => setFormat(event.target.value as "csv" | "json")}><option value="csv">CSV</option><option value="json">JSON</option></select></div>
      </div>
      <label className="form-row"><span>Usage export</span><textarea rows={8} value={text} onChange={(event) => { setText(event.target.value); setPreview(null); }} placeholder={format === "csv" ? "provider,date,cost_usd,run_id,model…" : '[{"provider":"openai","date":"2026-09-01","cost_usd":1.25}]'} /><small>Preview is mandatory before commit. An invoice total without run attribution remains unattributed.</small></label>
      <div className="form-actions"><button className="button button--primary" type="button" disabled={busy || !text.trim()} onClick={() => void submit(false)}>Preview</button>{preview && preview.errors.length === 0 ? <button className="button button--ghost" type="button" disabled={busy} onClick={() => void submit(true)}>Commit import</button> : null}<small role="status">{message}</small></div>
      {preview ? <div className="finding-list"><div className="finding"><div className="finding__top"><h3>{preview.rowCount} source rows</h3><strong>{preview.totalCostUsd === null ? "Unknown total" : `$${preview.totalCostUsd.toFixed(2)}`}</strong></div><p>Valid: {preview.validRows.length} · errors: {preview.errors.length} · run-attribution coverage: {preview.attribution.runAttributionCoveragePct === null ? "Unknown" : `${preview.attribution.runAttributionCoveragePct.toFixed(1)}%`} · unattributed: {preview.attribution.unattributedCostUsd === null ? "Unknown" : `$${preview.attribution.unattributedCostUsd.toFixed(2)}`}</p></div>{preview.errors.slice(0, 10).map((error) => <div className="finding" key={`${error.row}:${error.message}`}><p>Row {error.row}: {error.message}</p></div>)}</div> : null}
    </div>
  </section>;
}
