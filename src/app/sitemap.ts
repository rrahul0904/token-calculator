import type { MetadataRoute } from "next";
import { CURATED_COMPARISONS, getCanonicalComparison, getCurrentModels } from "@/lib/model-discovery";
import { getPublicSiteUrl } from "@/lib/site-url";

const publicRoutes = [
  "",
  "/models",
  "/pricing",
  "/developers",
  "/guides",
  "/guides/openai",
  "/guides/anthropic",
  "/guides/gemini",
  "/tools/cost",
  "/tools/tokens-words",
  "/tools/memory",
  "/tools/speed",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getPublicSiteUrl();
  const modelRoutes = getCurrentModels().flatMap((model) => [
    `/models/${model.id}`,
    `/models/${model.id}/pricing-history`,
  ]);
  const comparisonRoutes = CURATED_COMPARISONS.flatMap(([left, right]) => {
    const comparison = getCanonicalComparison(left, right);
    return comparison ? [comparison.path] : [];
  });
  const routes = [...publicRoutes, ...modelRoutes, ...comparisonRoutes];

  return [...new Set(routes)].map((route) => ({
    url: baseUrl + route,
    lastModified: new Date("2026-09-04T00:00:00.000Z"),
    changeFrequency: route === "" || route === "/models" || route.includes("/pricing-history") ? "daily" : "weekly",
    priority: route === "" ? 1 : route === "/models" ? 0.9 : route.startsWith("/models/") ? 0.8 : 0.7,
  }));
}
