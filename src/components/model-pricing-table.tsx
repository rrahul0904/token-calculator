"use client";

import { useMemo, useState } from "react";
import { MODEL_CATALOG, PROVIDERS, type ProviderName } from "@/lib/models";
import { formatTokens } from "@/lib/format";
import { resolvePricing } from "@/lib/pricing";

export function ModelPricingTable() {
  const [provider, setProvider] = useState<ProviderName | "All">("All");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => MODEL_CATALOG.filter((model) => {
    const providerMatch = provider === "All" || model.provider === provider;
    const queryMatch = `${model.provider} ${model.name}`.toLowerCase().includes(query.trim().toLowerCase());
    return providerMatch && queryMatch;
  }), [provider, query]);
  return <><div className="table-controls"><label>Search models<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="GPT, Claude, Gemini…" /></label><label>Provider<select value={provider} onChange={(event) => setProvider(event.target.value as ProviderName | "All")}><option value="All">All providers</option>{PROVIDERS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div><div className="pricing-table-wrap"><table className="pricing-table"><thead><tr><th>Model</th><th>Context</th><th>Input / 1M</th><th>Cached / 1M</th><th>Output / 1M</th><th>Tier</th><th>Source</th></tr></thead><tbody>{rows.map((model) => {
  const resolved = resolvePricing({ model, inputTokens: 0 });
  return <tr key={model.id}><td><strong>{model.name}</strong><span>{model.provider}{model.status ? ` · ${model.status}` : ""}</span></td><td>{formatTokens(model.contextWindow)}{model.maxOutput ? <span>{formatTokens(model.maxOutput)} max output</span> : null}</td><td>${resolved.pricing.input.toFixed(resolved.pricing.input < 1 ? 3 : 2)}</td><td>{resolved.pricing.cachedInput === undefined ? "Not offered" : `${resolved.pricing.cachedInput.toFixed(resolved.pricing.cachedInput < 1 ? 3 : 2)}`}</td><td>${resolved.pricing.output.toFixed(resolved.pricing.output < 1 ? 3 : 2)}</td><td>{model.longContext ? <span className="tier-pill">Auto tier above {formatTokens(model.longContext.threshold)}</span> : <span className="muted">{resolved.tier}</span>}</td><td><a href={resolved.sourceUrl} target="_blank" rel="noreferrer">Official ↗</a><span>{resolved.verifiedAt}</span></td></tr>;
})}</tbody></table></div><p className="table-note">{rows.length} model profiles shown. Prices are planning estimates; provider-specific tool, storage, media, batch, priority, and regional charges may be separate.</p></>;
}
