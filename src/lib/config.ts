export type IntegrationState = "live" | "code_complete_configuration_blocked" | "not_enabled";

function all(...names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]));
}

export function getConfigurationStatus() {
  return {
    database: all("DATABASE_URL") ? "live" : "code_complete_configuration_blocked",
    auth: all("WORKOS_API_KEY", "WORKOS_CLIENT_ID", "WORKOS_COOKIE_PASSWORD", "NEXT_PUBLIC_WORKOS_REDIRECT_URI")
      ? "live"
      : "code_complete_configuration_blocked",
    stripe: all("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PRO", "STRIPE_PRICE_TEAM")
      ? "live"
      : "code_complete_configuration_blocked",
    credentialVault: all("TOKEN_INTELLIGENCE_ENCRYPTION_KEY") ? "live" : "code_complete_configuration_blocked",
    github: all("GITHUB_APP_ID", "GITHUB_PRIVATE_KEY", "GITHUB_WEBHOOK_SECRET")
      ? "live"
      : "code_complete_configuration_blocked",
    otel: all("OTEL_EXPORTER_OTLP_ENDPOINT") ? "live" : "code_complete_configuration_blocked",
    redis: all("REDIS_URL") ? "live" : "not_enabled",
  } satisfies Record<string, IntegrationState>;
}

export function requiredConfiguration(feature: keyof ReturnType<typeof getConfigurationStatus>): string[] {
  const map: Record<keyof ReturnType<typeof getConfigurationStatus>, string[]> = {
    database: ["DATABASE_URL"],
    auth: ["WORKOS_API_KEY", "WORKOS_CLIENT_ID", "WORKOS_COOKIE_PASSWORD", "NEXT_PUBLIC_WORKOS_REDIRECT_URI"],
    stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PRO", "STRIPE_PRICE_TEAM"],
    credentialVault: ["TOKEN_INTELLIGENCE_ENCRYPTION_KEY"],
    github: ["GITHUB_APP_ID", "GITHUB_PRIVATE_KEY", "GITHUB_WEBHOOK_SECRET"],
    otel: ["OTEL_EXPORTER_OTLP_ENDPOINT"],
    redis: ["REDIS_URL"],
  };
  return map[feature];
}
