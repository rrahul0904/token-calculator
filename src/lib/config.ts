import { hasConfiguredWorkosRedirectUri } from "@/lib/auth/redirect-uri";

export type IntegrationState = "live" | "code_complete_configuration_blocked" | "not_enabled";

function all(...names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]));
}

/**
 * The browser suite has a deliberately explicit, server-only auth adapter so
 * it can exercise tenant-scoped pages without shipping test credentials or a
 * WorkOS session.  Treat it as an auth provider only when every part of that
 * adapter was intentionally configured.  Normal deployments remain fail
 * closed on missing WorkOS configuration.
 */
function hasExplicitE2eAuthAdapter(): boolean {
  return (
    process.env.TOKEN_INTELLIGENCE_E2E_AUTH_ENABLED === "1" &&
    all(
      "TOKEN_INTELLIGENCE_E2E_AUTH_SECRET",
      "TOKEN_INTELLIGENCE_E2E_USER_ID",
      "TOKEN_INTELLIGENCE_E2E_USER_EMAIL",
      "TOKEN_INTELLIGENCE_E2E_WORKOS_ORG_ID",
    )
  );
}

/** True only when a real WorkOS/AuthKit runtime can be initialized. */
export function hasWorkosAuthConfiguration(): boolean {
  return all("WORKOS_API_KEY", "WORKOS_CLIENT_ID", "WORKOS_COOKIE_PASSWORD") && hasConfiguredWorkosRedirectUri();
}

export function getConfigurationStatus() {
  return {
    database: all("DATABASE_URL") ? "live" : "code_complete_configuration_blocked",
    auth:
      hasWorkosAuthConfiguration() || hasExplicitE2eAuthAdapter()
        ? "live"
        : "code_complete_configuration_blocked",
    stripe: all("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PRO", "STRIPE_PRICE_TEAM")
      ? "live"
      : "code_complete_configuration_blocked",
    credentialVault: all("TOKEN_INTELLIGENCE_ENCRYPTION_KEY") ? "live" : "code_complete_configuration_blocked",
    github: all("GITHUB_APP_ID", "GITHUB_PRIVATE_KEY", "GITHUB_WEBHOOK_SECRET")
      ? "live"
      : "code_complete_configuration_blocked",
    otel: all("OTEL_EXPORTER_OTLP_ENDPOINT") ? "live" : "not_enabled",
    alerts: all("TOKEN_INTELLIGENCE_WEBHOOK_SECRET", "TOKEN_INTELLIGENCE_ENCRYPTION_KEY") ? "live" : "code_complete_configuration_blocked",
    retention: all("CRON_SECRET") ? "live" : "code_complete_configuration_blocked",
    redis: all("REDIS_URL") ? "live" : "not_enabled",
  } satisfies Record<string, IntegrationState>;
}

export function requiredConfiguration(feature: keyof ReturnType<typeof getConfigurationStatus>): string[] {
  const map: Record<keyof ReturnType<typeof getConfigurationStatus>, string[]> = {
    database: ["DATABASE_URL"],
    auth: ["WORKOS_API_KEY", "WORKOS_CLIENT_ID", "WORKOS_COOKIE_PASSWORD", "NEXT_PUBLIC_WORKOS_REDIRECT_URI or Vercel system URL"],
    stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PRO", "STRIPE_PRICE_TEAM"],
    credentialVault: ["TOKEN_INTELLIGENCE_ENCRYPTION_KEY"],
    github: ["GITHUB_APP_ID", "GITHUB_PRIVATE_KEY", "GITHUB_WEBHOOK_SECRET"],
    otel: ["OTEL_EXPORTER_OTLP_ENDPOINT"],
    alerts: ["TOKEN_INTELLIGENCE_WEBHOOK_SECRET", "TOKEN_INTELLIGENCE_ENCRYPTION_KEY"],
    retention: ["CRON_SECRET"],
    redis: ["REDIS_URL"],
  };
  return map[feature];
}
