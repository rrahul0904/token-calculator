export type PlatformCostProvider = "vercel" | "neon" | "workos" | "stripe" | "github" | "otel" | "other";
export type CostProviderState = "configured" | "not_configured" | "unavailable";

const requirements: Record<Exclude<PlatformCostProvider, "other">, string[]> = {
  vercel: ["VERCEL_COST_API_TOKEN"], neon: ["NEON_COST_API_KEY"], workos: ["WORKOS_API_KEY"], stripe: ["STRIPE_SECRET_KEY"], github: ["GITHUB_COST_API_TOKEN"], otel: ["OTEL_EXPORTER_OTLP_ENDPOINT"],
};

/** Capability discovery never fetches provider billing nor exposes credential values. */
export function platformCostProviderStates() {
  return (Object.keys(requirements) as Array<Exclude<PlatformCostProvider, "other">>).map((provider) => ({
    provider,
    state: requirements[provider].every((key) => Boolean(process.env[key])) ? "configured" as const : "not_configured" as const,
    importMode: provider === "workos" ? "manual_or_invoice" : "api_or_manual",
  }));
}
