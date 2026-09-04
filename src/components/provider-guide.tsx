import Link from "next/link";
import { ProviderCostGuide } from "@/components/provider-cost-guide";
import { formatTokens } from "@/lib/format";
import { modelsByProvider, type ProviderName } from "@/lib/models";
import { resolvePricing } from "@/lib/pricing";
import { publicUrl } from "@/lib/site-url";

type ProviderGuideProps = {
  provider: ProviderName;
  eyebrow: string;
  title: string;
  description: string;
  countingNote: string;
};

export function ProviderGuide({ provider, eyebrow, title, description, countingNote }: ProviderGuideProps) {
  const models = modelsByProvider(provider).filter((model) => model.status !== "legacy");
  const latestVerification = models.map((model) => model.verifiedAt).sort().at(-1) ?? "unknown";
  const breadcrumbData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: publicUrl("/") },
      { "@type": "ListItem", position: 2, name: "Guides", item: publicUrl("/guides") },
      { "@type": "ListItem", position: 3, name: provider },
    ],
  };

  return (
    <main className="page-shell shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbData) }} />
      <section className="page-hero">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="form-actions">
          <Link href="/#calculator" className="button button--primary">Count text locally</Link>
          <Link href="/models" className="button button--ghost">All model pricing</Link>
        </div>
      </section>

      <section className="insight-strip">
        <div><span>Models in this guide</span><strong>{models.length}</strong></div>
        <div><span>Catalog verified</span><strong>{latestVerification}</strong></div>
        <div><span>Pricing source</span><strong>Official provider docs</strong></div>
      </section>

      <ProviderCostGuide provider={provider} />

      <section className="tool-card docs-section">
        <p className="eyebrow">Counting precision</p>
        <h2>Plan locally; reconcile with provider usage.</h2>
        <p>{countingNote}</p>
        <p className="muted">The public calculator intentionally keeps pasted text in the browser. Final production billing should use the selected provider&apos;s measured usage fields and current billing documentation.</p>
      </section>

      <section className="tool-card">
        <p className="eyebrow">Current planning catalog</p>
        <h2>{provider} models represented here</h2>
        <div className="pricing-table-wrap">
          <table className="pricing-table">
            <thead><tr><th>Model</th><th>Context</th><th>Input / 1M</th><th>Cache / 1M</th><th>Output / 1M</th><th>Source</th></tr></thead>
            <tbody>
              {models.map((model) => {
                const resolved = resolvePricing({ model, inputTokens: 0 });
                return (
                <tr key={model.id}>
                  <td><strong>{model.name}</strong><span>{model.pricingLabel ?? model.status ?? "current"}</span></td>
                  <td>{formatTokens(model.contextWindow)}<span>{model.maxOutput ? formatTokens(model.maxOutput) + " max output" : null}</span></td>
                  <td>{"$" + model.pricing.input}</td>
                  <td>{model.pricing.cachedInput === undefined ? "Not offered" : "$" + model.pricing.cachedInput}</td>
                  <td>{"$" + model.pricing.output}</td>
                  <td><a href={model.sourceUrl} target="_blank" rel="noreferrer">Official ↗</a><span>{model.verifiedAt}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
