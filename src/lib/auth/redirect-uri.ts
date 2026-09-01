export function configuredWorkosRedirectUri(): string | undefined {
  const configured = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI?.trim();

  if (process.env.VERCEL_ENV === "preview") {
    const previewHost = process.env.VERCEL_URL?.trim();
    if (previewHost) return `https://${previewHost}/auth/callback`;
  }

  if (process.env.VERCEL_ENV === "production") {
    if (configured) return configured;
    const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    if (productionHost) return `https://${productionHost}/auth/callback`;
  }

  return configured || undefined;
}

export function hasConfiguredWorkosRedirectUri(): boolean {
  return Boolean(configuredWorkosRedirectUri());
}

export function workosRedirectUriForRequest(requestOrigin: string): string {
  return configuredWorkosRedirectUri() ?? new URL("/auth/callback", requestOrigin).toString();
}
