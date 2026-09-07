"use client";

import { useState } from "react";

export function CodeExampleTabs({
  title,
  examples,
}: {
  title: string;
  examples: Array<{ label: string; code: string }>;
}) {
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState("");
  const current = examples[active] ?? examples[0];

  async function copy() {
    if (!current) return;
    await navigator.clipboard.writeText(current.code);
    setStatus(current.label + " example copied.");
  }

  if (!current) return null;

  return <section className="tool-card docs-section">
    <div className="section-heading"><div><p className="eyebrow">Quickstart</p><h2>{title}</h2></div></div>
    <div className="preset-row" role="tablist" aria-label={title + " language"}>
      {examples.map((example, index) => <button key={example.label} type="button" role="tab" aria-selected={active === index} className={active === index ? "preset preset--active" : "preset"} onClick={() => { setActive(index); setStatus(""); }}>{example.label}</button>)}
    </div>
    <pre><code>{current.code}</code></pre>
    <div className="form-actions"><button type="button" className="button button--ghost" onClick={copy}>Copy {current.label}</button><span role="status" className="muted">{status}</span></div>
  </section>;
}
