import type { Metadata } from "next";
import { TokenCalculator } from "@/components/token-calculator";
import { publicUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Token Intelligence — AI Workload Economics",
  description: "Count tokens locally, compare model pricing, plan context headroom, and forecast LLM workload cost without uploading prompt text.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Token Intelligence — AI Workload Economics",
    description: "Private local token counting, model pricing, context planning, and LLM workload cost.",
    url: "/",
  },
};

export default function Home() {
  const softwareData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Token Intelligence",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    url: publicUrl("/"),
    description: "Privacy-first local token counting, model pricing, context planning, and AI workload economics.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", category: "Free calculator" },
  };

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareData) }} />
    <TokenCalculator />
  </>;
}
