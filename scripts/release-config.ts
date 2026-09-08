type State = "configured" | "missing" | "not_enabled";

const groups: Record<string, { required: string[]; optional?: boolean }> = {
  core: { required: ["APP_BASE_URL", "DATABASE_URL", "TOKEN_INTELLIGENCE_ENCRYPTION_KEY", "CRON_SECRET"] },
  workos: { required: ["WORKOS_API_KEY", "WORKOS_CLIENT_ID", "WORKOS_COOKIE_PASSWORD", "NEXT_PUBLIC_WORKOS_REDIRECT_URI", "WORKOS_WEBHOOK_SECRET"] },
  mcpOAuth: { required: ["WORKOS_AUTHKIT_DOMAIN", "MCP_RESOURCE_URI"] },
  stripe: { required: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PRO", "STRIPE_PRICE_TEAM"] },
  github: { required: ["GITHUB_APP_ID", "GITHUB_PRIVATE_KEY", "GITHUB_WEBHOOK_SECRET"], optional: true },
  alerts: { required: ["TOKEN_INTELLIGENCE_WEBHOOK_SECRET", "TOKEN_INTELLIGENCE_ENCRYPTION_KEY"], optional: true },
  otel: { required: ["OTEL_EXPORTER_OTLP_ENDPOINT"], optional: true },
  redis: { required: ["REDIS_URL"], optional: true },
};

function stateFor(required: string[], optional = false): State {
  const present = required.filter((key) => Boolean(process.env[key]));
  if (present.length === required.length) return "configured";
  if (optional && present.length === 0) return "not_enabled";
  return "missing";
}

const result = Object.fromEntries(Object.entries(groups).map(([name, group]) => [
  name,
  {
    state: stateFor(group.required, group.optional),
    variables: Object.fromEntries(group.required.map((key) => [key, process.env[key] ? "configured" : "missing"])),
  },
]));

process.stdout.write(JSON.stringify(result, null, 2) + "\n");

const requiredMissing = Object.entries(groups).filter(([, group]) => !group.optional).some(([name]) => result[name]?.state !== "configured");
if (process.argv.includes("--require-production") && requiredMissing) process.exitCode = 2;
