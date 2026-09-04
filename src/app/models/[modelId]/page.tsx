import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModelCostEstimator } from "@/components/model-cost-estimator";
import { formatTokens } from "@/lib/format";
import { getComparableModels, getCurrentModels, getModel, getRelatedModels } from "@/lib/model-discovery";
import { resolvePricing } from "@/lib/pricing";
import { publicUrl } from "@/lib/site-url";
import { getTokenizerSpec, tokenizerPrecisionLabel } from "@/lib/tokenizers/registry";

export function generateStaticParams() {
  return getCurrentModels().map((model) => ({ modelId: model.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ modelId: string }> }): Promise<Metadata> {
  const { modelId } = await params;
  const model = getModel(modelId);
  if (!model) return { title: "Model not found" };
  const description = `${model.name} API pricing, context window, tokenizer precision, cache rates, long-context rules, and workload cost estimates with official-source provenance.`;
  return {
    title: `${model.name} pricing, tokens & context`,
    description,
    alternates: { canonical: `/models/${model.id}` },
    openGraph: { title: `${model.name} pricing, tokens & context`, description, url: `/models/${model.id}` },
  };
}

function providerGuide(provider: string) {
  if (provider === "OpenAI") return "/guides/openai";
  if (provider === "Anthropic") return "/guides/anthropic";
  if (provider === "Google") return "/guides/gemini";
  return "/models";
}

export default async function ModelDetailPage({ params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params;
  const model = getModel(modelId);
  if (!model) notFound();

  const resolved = resolvePricing({ model, inputTokens: 0 });
  const tokenizer = getTokenizerSpec(model.tokenizer);
  const related = getRelatedModels(model);
  const comparable = getComparableModels(model);
  const breadcrumbData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: publicUrl("/") },
      { "@type": "ListItem", position: 2, name: "Models", item: publicUrl("/models") },
      { "@type": "ListItem", position: 3, name: model.name, item: publicUrl(`/models/${model.id}`) },
    ],
  };

  return <main className="page-shell shell">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbData) }} />
    <section className="page-hero">
      <p className="eyebrow">{model.provider} · {model.status ?? "current"}</p>
      <h1>{model.name} pricing, context and token planning</h1>
      <p>Current effective economics from the shared Token Intelligence catalog, with tokenizer certainty and official pricing provenance kept explicit.</p>
      <div className="form-actions">
        <Link className="button button--primary" href={"/?mode=tokens&model=" + encodeURIComponent(model.id)}>Open calculator</Link>
        <Link className="button button--ghost" href="/tools/cost">Open Cost Lab</Link>
        <Link className="button button--ghost" href={`/models/${model.id}/pricing-history`}>Pricing history</Link>
      </div>
    </section>

    <section className="insight-strip">
      <div><span>Context window</span><strong>{formatTokens(model.contextWindow)}</strong><small>{model.maxOutput ? formatTokens(model.maxOutput) + " max output" : "Published output varies"}</small></div>
      <div><span>Tokenizer certainty</span><strong>{tokenizerPrecisionLabel(tokenizer.precision)}</strong><small>{tokenizer.displayName}</small></div>
      <div><span>Pricing verified</span><strong>{resolved.verifiedAt}</strong><small>{resolved.tier}</small></div>
    </section>

    <section className="tool-card docs-section">
      <p className="eyebrow">Current effective text pricing</p>
      <h2>Standard workload rates</h2>
      <div className="pricing-table-wrap"><table className="pricing-table"><thead><tr><th>Input / 1M</th><th>Cached input / 1M</th><th>Output / 1M</th><th>5m cache write</th><th>1h cache write</th><th>Source</th></tr></thead><tbody><tr>
        <td>{"$" + resolved.pricing.input}</td>
        <td>{resolved.pricing.cachedInput === undefined ? "Not offered" : "$" + resolved.pricing.cachedInput}</td>
        <td>{"$" + resolved.pricing.output}</td>
        <td>{resolved.pricing.cacheWrite5m === undefined ? "Not represented" : "$" + resolved.pricing.cacheWrite5m}</td>
        <td>{resolved.pricing.cacheWrite1h === undefined ? "Not represented" : "$" + resolved.pricing.cacheWrite1h}</td>
        <td><a href={resolved.sourceUrl} target="_blank" rel="noreferrer">Official source ↗</a><span>{resolved.verifiedAt}</span></td>
      </tr></tbody></table></div>
      {model.longContext ? <p className="tier-notice">Long-context rule: {model.longContext.label}. The shared cost engine selects this tier automatically when the configured threshold is exceeded.</p> : null}
      {model.note ? <p className="table-note">{model.note}</p> : null}
      <p className="table-note">{tokenizer.caveat}</p>
    </section>

    <ModelCostEstimator model={model} />

    <section className="tool-card docs-section">
      <p className="eyebrow">Developer API</p>
      <h2>Fetch this model programmatically.</h2>
      <pre><code>{`curl ${publicUrl(`/api/v1/models/${model.id}`)}`}</code></pre>
      <div className="form-actions"><Link className="button button--ghost" href="/developers">Developer quickstart</Link><Link className="button button--ghost" href="/openapi.json">OpenAPI</Link></div>
    </section>

    <section className="tool-card docs-section">
      <p className="eyebrow">Compare</p>
      <h2>Related economics comparisons</h2>
      <div className="tool-link-grid">
        {comparable.slice(0, 4).map((candidate) => {
          const href = model.provider === candidate.provider || model.provider === "OpenAI"
            ? `/compare/${model.id}/vs/${candidate.id}`
            : `/compare/${candidate.id}/vs/${model.id}`;
          return <Link key={candidate.id} className="tool-link" href={href}><p className="eyebrow">{candidate.provider}</p><h3>{model.name} vs {candidate.name}</h3><p>Compare text rates, context, tokenizer certainty and the same workload assumptions.</p><span>Compare →</span></Link>;
        })}
      </div>
    </section>

    <section className="tool-card docs-section">
      <p className="eyebrow">Discover</p>
      <h2>More {model.provider} and related models</h2>
      <div className="form-actions">{related.map((candidate) => <Link key={candidate.id} className="button button--ghost" href={`/models/${candidate.id}`}>{candidate.name}</Link>)}</div>
      <div className="form-actions"><Link href={providerGuide(model.provider)} className="button button--ghost">{model.provider} guide</Link><Link href="/models" className="button button--ghost">All models</Link></div>
    </section>
  </main>;
}
