import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentModels, getModel, getModelPricingHistory } from "@/lib/model-discovery";
import { publicUrl } from "@/lib/site-url";

export function generateStaticParams() {
  return getCurrentModels().map((model) => ({ modelId: model.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ modelId: string }> }): Promise<Metadata> {
  const { modelId } = await params;
  const model = getModel(modelId);
  if (!model) return { title: "Pricing history not found" };
  const description = `Represented effective pricing windows and provenance for ${model.name}. No undocumented historical prices are fabricated.`;
  return {
    title: `${model.name} pricing history`,
    description,
    alternates: { canonical: `/models/${model.id}/pricing-history` },
    openGraph: { title: `${model.name} pricing history`, description, url: `/models/${model.id}/pricing-history` },
  };
}

export default async function PricingHistoryPage({ params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params;
  const model = getModel(modelId);
  if (!model) notFound();
  const history = getModelPricingHistory(model);
  const breadcrumbData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Models", item: publicUrl("/models") },
      { "@type": "ListItem", position: 2, name: model.name, item: publicUrl(`/models/${model.id}`) },
      { "@type": "ListItem", position: 3, name: "Pricing history", item: publicUrl(`/models/${model.id}/pricing-history`) },
    ],
  };

  return <main className="page-shell shell">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbData) }} />
    <section className="page-hero"><p className="eyebrow">Pricing provenance</p><h1>{model.name} pricing history</h1><p>Only pricing windows explicitly represented in the catalog are shown. Unknown historical periods remain unknown rather than being reconstructed from guesses.</p><div className="form-actions"><Link href={`/models/${model.id}`} className="button button--primary">Back to model</Link><Link href="/models" className="button button--ghost">All models</Link></div></section>
    <section className="tool-card">
      <div className="pricing-table-wrap"><table className="pricing-table"><thead><tr><th>Status</th><th>Effective from</th><th>Effective to</th><th>Input / 1M</th><th>Cache / 1M</th><th>Output / 1M</th><th>Tier</th><th>Source</th></tr></thead><tbody>
        {history.map((entry) => <tr key={entry.id}><td><span className="tier-pill">{entry.status.replaceAll("_", " ")}</span></td><td>{entry.effectiveFrom ?? "Not represented"}</td><td>{entry.effectiveTo ?? "Open-ended / current catalog"}</td><td>{"$" + entry.pricing.input}</td><td>{entry.pricing.cachedInput === undefined ? "Not offered" : "$" + entry.pricing.cachedInput}</td><td>{"$" + entry.pricing.output}</td><td>{entry.serviceTier ?? entry.label}</td><td><a href={entry.sourceUrl} target="_blank" rel="noreferrer">Official ↗</a><span>{entry.verifiedAt}</span></td></tr>)}
      </tbody></table></div>
    </section>
  </main>;
}
