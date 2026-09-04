const DEFAULT_PUBLIC_SITE_URL = "https://token-intelligence-eight.vercel.app";

export function getPublicSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_BASE_URL ?? DEFAULT_PUBLIC_SITE_URL;
  return configured.replace(/\/$/, "");
}

export function publicUrl(path = "/") {
  const normalized = path.startsWith("/") ? path : "/" + path;
  return getPublicSiteUrl() + normalized;
}
