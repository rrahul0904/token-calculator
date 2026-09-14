export function configuredWorkosRedirectUri(): string | undefined {
  const configured = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI?.trim();

  // Exact Preview deployments must callback to themselves. WorkOS Staging
  // allows the project's Vercel hostname pattern, so a stale branch URL must
  // never override VERCEL_URL for a generated Preview deployment.
  if (process.env.VERCEL_ENV === "preview") {
    const previewHost = process.env.VERCEL_URL?.trim();
    if (previewHost) return `https://${previewHost}/auth/callback`;
    return configured || undefined;
  }

  // Production remains pinned to the explicitly configured canonical callback.
  if (configured) return configured;

  if (process.env.VERCEL_ENV === "production") {
    const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    if (productionHost) return `https://${productionHost}/auth/callback`;
  }

  return configured || undefined;
}

export function hasConfiguredWorkosRedirectUri(): boolean {
  return Boolean(configuredWorkosRedirectUri());
}

export function workosRedirectUriForRequest(requestOrigin: string): string {
  const origin = new URL(requestOrigin).origin;

  // A staged Production deployment must be certifiable before the stable
  // production domain is moved. Vercel exposes that deployment's immutable
  // hostname as VERCEL_URL. Only trust that exact system hostname; arbitrary
  // Host/request origins must never override the canonical Production URI.
  if (process.env.VERCEL_ENV === "production") {
    const deploymentHost = process.env.VERCEL_URL?.trim();
    if (deploymentHost && origin === `https://${deploymentHost}`) {
      return `${origin}/auth/callback`;
    }
  }

  return configuredWorkosRedirectUri() ?? new URL("/auth/callback", origin).toString();
}
