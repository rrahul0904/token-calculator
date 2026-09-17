const DEFAULT_PUBLIC_SITE_URL = "https://token-intelligence-eight.vercel.app";

function normalize(url: string) {
  return url.replace(/\/$/, "");
}

export function getPublicSiteUrl() {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();

  // Preview deployments must publish canonical/OG URLs for the stable production
  // host. Branch-scoped Vercel variables can otherwise leave SEO metadata pinned
  // to an obsolete unique preview deployment.
  if (process.env.VERCEL_ENV === "preview" && productionHost) {
    return normalize(productionHost.includes("://") ? productionHost : `https://${productionHost}`);
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_BASE_URL;
  if (configured?.trim()) return normalize(configured.trim());

  if (productionHost) {
    return normalize(productionHost.includes("://") ? productionHost : `https://${productionHost}`);
  }

  return DEFAULT_PUBLIC_SITE_URL;
}

export function publicUrl(path = "/") {
  const normalized = path.startsWith("/") ? path : "/" + path;
  return getPublicSiteUrl() + normalized;
}
