export type ReleaseScope = "production" | "preview" | "local-test";

export interface ReleaseEnvSpec {
  name: string;
  description: string;
  secret: boolean;
  requiredIn: ReleaseScope[];
}

export const RELEASE_ENV_CONTRACT: readonly ReleaseEnvSpec[] = [
  { name: "APP_BASE_URL", description: "Canonical application origin.", secret: false, requiredIn: ["production", "preview", "local-test"] },
  { name: "DATABASE_URL", description: "PostgreSQL connection string.", secret: true, requiredIn: ["production", "preview", "local-test"] },
  { name: "DATABASE_SSL", description: "Database TLS mode.", secret: false, requiredIn: ["production", "preview", "local-test"] },
  { name: "WORKOS_API_KEY", description: "WorkOS server credential.", secret: true, requiredIn: ["production", "preview"] },
  { name: "WORKOS_CLIENT_ID", description: "WorkOS AuthKit client identifier.", secret: false, requiredIn: ["production", "preview"] },
  { name: "WORKOS_COOKIE_PASSWORD", description: "AuthKit cookie encryption password.", secret: true, requiredIn: ["production", "preview"] },
  { name: "NEXT_PUBLIC_WORKOS_REDIRECT_URI", description: "AuthKit callback URL.", secret: false, requiredIn: ["production"] },
  { name: "WORKOS_WEBHOOK_SECRET", description: "WorkOS webhook signing secret.", secret: true, requiredIn: ["production", "preview"] },
  { name: "WORKOS_AUTHKIT_DOMAIN", description: "AuthKit issuer used for MCP OAuth.", secret: false, requiredIn: ["production", "preview"] },
  { name: "MCP_RESOURCE_URI", description: "OAuth protected-resource URI.", secret: false, requiredIn: ["production", "preview"] },
  { name: "STRIPE_SECRET_KEY", description: "Stripe server credential.", secret: true, requiredIn: ["production", "preview"] },
  { name: "STRIPE_WEBHOOK_SECRET", description: "Stripe webhook signing secret.", secret: true, requiredIn: ["production", "preview"] },
  { name: "STRIPE_PRICE_PRO", description: "Stripe recurring Price ID for Pro.", secret: false, requiredIn: ["production", "preview"] },
  { name: "STRIPE_PRICE_TEAM", description: "Stripe recurring Price ID for Team.", secret: false, requiredIn: ["production", "preview"] },
  { name: "TOKEN_INTELLIGENCE_ENCRYPTION_KEY", description: "Credential-vault encryption key.", secret: true, requiredIn: ["production", "preview", "local-test"] },
  { name: "CRON_SECRET", description: "Retention/cron authorization secret.", secret: true, requiredIn: ["production", "preview"] },
  { name: "TOKEN_INTELLIGENCE_CONFIGURED_DATA_REGION", description: "Declared configured data region.", secret: false, requiredIn: [] },
  { name: "TOKEN_INTELLIGENCE_DEPLOYMENT_REGION", description: "Observed deployment/storage region.", secret: false, requiredIn: [] },
  { name: "GITHUB_APP_ID", description: "Optional GitHub App ID.", secret: false, requiredIn: [] },
  { name: "GITHUB_PRIVATE_KEY", description: "Optional GitHub App private key.", secret: true, requiredIn: [] },
  { name: "GITHUB_WEBHOOK_SECRET", description: "Optional GitHub webhook signing secret.", secret: true, requiredIn: [] },
  { name: "TOKEN_INTELLIGENCE_WEBHOOK_SECRET", description: "Optional outbound webhook signing secret.", secret: true, requiredIn: [] },
  { name: "OTEL_EXPORTER_OTLP_ENDPOINT", description: "Optional OTLP endpoint.", secret: false, requiredIn: [] },
  { name: "OTEL_EXPORTER_OTLP_HEADERS", description: "Optional OTLP authentication headers.", secret: true, requiredIn: [] },
  { name: "REDIS_URL", description: "Optional Redis URL.", secret: true, requiredIn: [] },
  { name: "TOKEN_INTELLIGENCE_E2E_AUTH_ENABLED", description: "Local/CI-only E2E auth switch.", secret: false, requiredIn: [] },
  { name: "TOKEN_INTELLIGENCE_E2E_AUTH_SECRET", description: "Local/CI-only E2E auth secret.", secret: true, requiredIn: [] },
] as const;

export function normalizedScope(value: string | undefined): ReleaseScope {
  if (value === "production" || value === "preview" || value === "local-test") return value;
  throw new Error("INVALID_RELEASE_SCOPE");
}

function hasValue(env: NodeJS.ProcessEnv, name: string) {
  return Boolean(env[name]?.trim());
}

export function releaseEnvStatus(scope: ReleaseScope, env: NodeJS.ProcessEnv = process.env) {
  const variables = RELEASE_ENV_CONTRACT.map((spec) => {
    const required = spec.requiredIn.includes(scope);
    let configured = hasValue(env, spec.name);
    let source: "explicit" | "system-derived" | "missing" = configured ? "explicit" : "missing";

    if (!configured && scope === "preview" && spec.name === "NEXT_PUBLIC_WORKOS_REDIRECT_URI" && hasValue(env, "VERCEL_URL")) {
      configured = true;
      source = "system-derived";
    }

    return {
      name: spec.name,
      required,
      secret: spec.secret,
      status: configured ? "present" as const : "missing" as const,
      source,
    };
  });
  const missing = variables.filter((item) => item.required && item.status === "missing").map((item) => item.name);
  return { scope, ready: missing.length === 0, missing, variables };
}
