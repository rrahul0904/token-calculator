"use client";

import { useMemo, useState } from "react";
import { buildContextPacket } from "@/lib/optimization/context-packet";

export function ContextPacketPlanner() {
  const [path, setPath] = useState("example.ts");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [maxCharacters, setMaxCharacters] = useState(8000);
  const [copied, setCopied] = useState(false);

  const outcome = useMemo(() => {
    if (!source || !query.trim()) return null;
    try {
      return { result: buildContextPacket({ files: [{ path, content: source }], query, maxCharacters }), error: null };
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : "Could not analyze this source" };
    }
  }, [path, query, source, maxCharacters]);
  const result = outcome?.result;

  async function copyPacket() {
    if (!result?.contextText) return;
    try {
      await navigator.clipboard.writeText(result.contextText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return <div className="tool-stack">
    <section className="tool-card">
      <div className="tool-grid tool-grid--2">
        <label>Relative source path
          <input value={path} onChange={(event) => { setPath(event.target.value); setCopied(false); }} spellCheck={false} placeholder="src/app/example.ts" />
        </label>
        <label>What code do you need?
          <input value={query} onChange={(event) => { setQuery(event.target.value); setCopied(false); }} placeholder="budget validation" />
        </label>
      </div>
      <label style={{ display: "grid", gap: 8, marginTop: 18 }}>Paste a single, non-sensitive source file (processed locally)
        <textarea value={source} onChange={(event) => { setSource(event.target.value); setCopied(false); }} maxLength={250000} spellCheck={false} placeholder="Paste source code here to generate line-referenced excerpts." />
      </label>
      <label style={{ display: "grid", gap: 8, maxWidth: 320, marginTop: 18 }}>Context packet limit (characters)
        <input type="number" min={256} max={128000} step={256} value={maxCharacters} onChange={(event) => setMaxCharacters(Number(event.target.value))} />
      </label>
      <p><small>No upload or API request is made by this tool. Do not paste credentials or confidential code: basic pattern masking is not a complete secrets scanner.</small></p>
    </section>
    {outcome?.error ? <p role="alert">{outcome.error}</p> : null}
    {result ? <section className="tool-card" aria-live="polite">
      <h2>Context packet</h2>
      <p><strong>{result.selectedCharacters.toLocaleString()}</strong> selected characters from <strong>{result.baselineCharacters.toLocaleString()}</strong> eligible source characters.</p>
      <p><strong>Read recommendation:</strong> {result.recommendedStrategy === "selective_packet" ? "Use selective excerpts, then verify against the original file before edits." : result.recommendedStrategy === "full_authorized_read" ? "Full authorized read may be more efficient for this input." : "No relevant matching excerpt. Refine the query."}</p>
      <p><small>Character reduction: {result.characterReductionPercent?.toFixed(2) ?? "n/a"}%. This is not measured token or dollar savings; no outcome-quality evaluation was performed.</small></p>
      {result.truncation ? <p><small>Some matching context did not fit within the selected budget.</small></p> : null}
      {result.skippedFiles.length ? <p><small>Excluded files: {result.skippedFiles.length} (unsafe path, size, or duplicate).</small></p> : null}
      <label style={{ display: "grid", gap: 8 }}>Reviewable excerpts
        <textarea readOnly value={result.contextText} spellCheck={false} aria-label="Generated line-referenced source excerpts" />
      </label>
      <button type="button" className="button button--primary" onClick={copyPacket} disabled={!result.contextText}>{copied ? "Copied" : "Copy context packet"}</button>
    </section> : null}
  </div>;
}
