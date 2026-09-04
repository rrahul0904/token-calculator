import type { MetadataRoute } from "next";

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
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://token-intelligence-eight.vercel.app").replace(/\/$/, "");
  return publicRoutes.map((route) => ({
    url: baseUrl + route,
    lastModified: new Date("2026-09-04T00:00:00.000Z"),
    changeFrequency: route === "" || route === "/models" ? "daily" : "weekly",
    priority: route === "" ? 1 : route === "/models" ? 0.9 : 0.7,
  }));
}
