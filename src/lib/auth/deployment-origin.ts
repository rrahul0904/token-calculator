function normalizeOrigin(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (!["https:", "http:"].includes(parsed.protocol)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Runtime application origin for security-sensitive callbacks/challenges.
 * Unlike SEO canonical URLs, Preview security endpoints must bind to the exact
 * generated deployment host rather than the stable Production hostname.
 */
export function runtimeApplicationOrigin(): string | null {
  if (process.env.VERCEL_ENV === "preview") {
    const preview = normalizeOrigin(process.env.VERCEL_URL);
    if (preview) return preview;
  }

  const configured = normalizeOrigin(process.env.APP_BASE_URL);
  if (configured) return configured;

  if (process.env.VERCEL_ENV === "production") {
    return normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  }

  return null;
}

export function runtimeMcpResourceUri(): string | null {
  const origin = runtimeApplicationOrigin();
  if (process.env.VERCEL_ENV === "preview" && origin) return `${origin}/mcp`;

  const explicit = process.env.MCP_RESOURCE_URI?.trim();
  if (explicit) {
    try {
      const parsed = new URL(explicit);
      if (!["https:", "http:"].includes(parsed.protocol)) return null;
      return parsed.toString().replace(/\/$/, "");
    } catch {
      return null;
    }
  }

  return origin ? `${origin}/mcp` : null;
}

export function hasRuntimeMcpResourceUri(): boolean {
  return Boolean(runtimeMcpResourceUri());
}
