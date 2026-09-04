import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ModelComparisonWorkload } from "@/components/model-comparison-workload";
import { parseComparisonState } from "@/lib/comparison-state";
import { CURATED_COMPARISONS, getCanonicalComparison } from "@/lib/model-discovery";
import { publicUrl } from "@/lib/site-url";

export function generateStaticParams() {
  return CURATED_COMPARISONS.flatMap(([left, right]) => {
    const canonical = getCanonicalComparison(left, right);
    return canonical ? [{ left: canonical.left.id, right: canonical.right.id }] : [];
  });
}

export async function generateMetadata({ params }: { params: Promise<{ left: string; right: string }> }): Promise<Metadata> {
  const { left, right } = await params;
  const comparison = getCanonicalComparison(left, right);
  if (!comparison) return { title: "Model comparison not found" };
  const title = `${comparison.left.name} vs ${comparison.right.name} pricing & context`;
  const description = `Compare ${comparison.left.name} and ${comparison.right.name} API pricing, context windows, tokenizer precision, cache rates, and monthly workload economics.`;
  return {
    title,
    description,
    alternates: { canonical: comparison.path },
    openGraph: { title, description, url: comparison.path },
  };
}

export default async function ModelComparisonPage({
  params,
  searchParams,
}: {
  params: Promise<{ left: string; right: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { left, right } = await params;
  const comparison = getCanonicalComparison(left, right);
  if (!comparison) notFound();
  if (!comparison.isCanonicalRequest) redirect(comparison.path);
  const state = parseComparisonState(await searchParams);
  const breadcrumbData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Models", item: publicUrl("/models") },
      { "@type": "ListItem", position: 2, name: `${comparison.left.name} vs ${comparison.right.name}`, item: publicUrl(comparison.path) },
    ],
  };

  return <main className="page-shell shell">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbData) }} />
    <section className="page-hero"><p className="eyebrow">Model economics comparison</p><h1>{comparison.left.name} vs {comparison.right.name}</h1><p>Compare the same workload across both models. Lower price does not imply equivalent quality, latency, reliability, or task performance.</p></section>
    <ModelComparisonWorkload left={comparison.left} right={comparison.right} initial={state} canonicalPath={comparison.path} />
  </main>;
}
