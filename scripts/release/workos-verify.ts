import process from "node:process";
import { normalizedScope } from "./env-contract";

type CheckState = "PASS" | "FAIL" | "BLOCKED_EXTERNAL";

const REQUIRED_DIRECTORY_EVENTS = [
  "dsync.deleted",
  "dsync.group.created",
  "dsync.group.deleted",
  "dsync.group.updated",
  "dsync.group.user_added",
  "dsync.group.user_removed",
  "dsync.user.created",
  "dsync.user.deleted",
  "dsync.user.updated",
] as const;

type WorkosWebhookEndpoint = {
  id?: string;
  endpoint_url?: string;
  secret?: string;
  status?: string;
  events?: string[];
};

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function boolEvidence(name: string): boolean | null {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return null;
  if (["1", "true", "yes", "configured", "active"].includes(value)) return true;
  if (["0", "false", "no", "missing", "inactive"].includes(value)) return false;
  return null;
}
function normalizeOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (!["https:", "http:"].includes(parsed.protocol)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

const scope = normalizedScope(argument("scope") ?? process.env.RELEASE_SCOPE ?? "production");
const baseUrl = argument("base-url") ?? process.env.APP_BASE_URL ?? "";
const origin = normalizeOrigin(baseUrl);
const issuerRaw = process.env.WORKOS_AUTHKIT_DOMAIN?.trim();
const issuer = issuerRaw ? normalizeOrigin(issuerRaw.includes("://") ? issuerRaw : `https://${issuerRaw}`) : null;
const redirect = scope === "preview" && origin
  ? `${origin}/auth/callback`
  : process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI?.trim() || null;
const productionState = process.env.WORKOS_PRODUCTION_STATE?.trim().toLowerCase() || "unknown";
const billingAddress = boolEvidence("WORKOS_BILLING_ADDRESS_CONFIGURED");
const paymentMethod = boolEvidence("WORKOS_PAYMENT_METHOD_CONFIGURED");

const expected = origin ? {
  redirectUri: `${origin}/auth/callback`,
  logoutUri: `${origin}/`,
  webOrigin: origin,
  signInUrl: `${origin}/sign-in`,
  webhookUrl: `${origin}/api/webhooks/workos`,
  mcpResourceUri: `${origin}/mcp`,
} : null;

let issuerReachable = false;
let issuerError: string | null = null;
if (issuer) {
  try {
    const response = await fetch(`${issuer}/oauth2/jwks`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(7000),
    });
    if (response.ok) {
      const body = await response.json() as { keys?: unknown[] };
      issuerReachable = Array.isArray(body.keys) && body.keys.length > 0;
      if (!issuerReachable) issuerError = "JWKS_EMPTY";
    } else {
      issuerError = `JWKS_HTTP_${response.status}`;
    }
  } catch {
    issuerError = "JWKS_UNAVAILABLE";
  }
}

const runtime = {
  apiKey: Boolean(process.env.WORKOS_API_KEY),
  clientId: Boolean(process.env.WORKOS_CLIENT_ID),
  cookiePassword: Boolean(process.env.WORKOS_COOKIE_PASSWORD),
  webhookSecret: Boolean(process.env.WORKOS_WEBHOOK_SECRET),
  authkitDomain: Boolean(issuer),
  redirectUri: Boolean(redirect),
};

let productionWebhook = {
  checked: false,
  configured: false,
  endpointId: null as string | null,
  enabled: false,
  exactEventSet: false,
  secretMatches: false,
  error: null as string | null,
};

if (scope === "production" && origin && process.env.WORKOS_API_KEY) {
  productionWebhook.checked = true;
  try {
    const response = await fetch("https://api.workos.com/webhook_endpoints?limit=100", {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${process.env.WORKOS_API_KEY}`,
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) {
      productionWebhook.error = `WEBHOOK_LIST_HTTP_${response.status}`;
    } else {
      const body = await response.json() as { data?: WorkosWebhookEndpoint[] };
      const expectedUrl = `${origin}/api/webhooks/workos`;
      const endpoint = (body.data ?? []).find((item) => item.endpoint_url === expectedUrl);
      const actualEvents = [...(endpoint?.events ?? [])].sort();
      const requiredEvents = [...REQUIRED_DIRECTORY_EVENTS].sort();
      productionWebhook = {
        checked: true,
        configured: Boolean(endpoint),
        endpointId: endpoint?.id ?? null,
        enabled: endpoint?.status === "enabled",
        exactEventSet: JSON.stringify(actualEvents) === JSON.stringify(requiredEvents),
        secretMatches: Boolean(
          endpoint?.secret
          && process.env.WORKOS_WEBHOOK_SECRET
          && endpoint.secret === process.env.WORKOS_WEBHOOK_SECRET
        ),
        error: null,
      };
    }
  } catch {
    productionWebhook.error = "WEBHOOK_LIST_UNAVAILABLE";
  }
}

const webhookProviderReady = scope !== "production"
  || (
    productionWebhook.checked
    && productionWebhook.configured
    && productionWebhook.enabled
    && productionWebhook.exactEventSet
    && productionWebhook.secretMatches
  );
const runtimeReady = Object.values(runtime).every(Boolean) && issuerReachable && webhookProviderReady;
const redirectMatches = Boolean(expected && redirect === expected.redirectUri);
const mcpResourceMatches = scope === "preview"
  ? Boolean(expected)
  : Boolean(expected && process.env.MCP_RESOURCE_URI?.replace(/\/$/, "") === expected.mcpResourceUri);

let state: CheckState = runtimeReady && redirectMatches && mcpResourceMatches ? "PASS" : "FAIL";
const externalBlockers: string[] = [];
if (scope === "production") {
  if (productionState !== "active") {
    externalBlockers.push(productionState === "inactive" ? "WORKOS_PRODUCTION_INACTIVE" : "WORKOS_PRODUCTION_STATE_UNVERIFIED");
  }
  if (billingAddress !== true) externalBlockers.push("WORKOS_BILLING_ADDRESS_UNVERIFIED");
  if (paymentMethod !== true) externalBlockers.push("WORKOS_PAYMENT_METHOD_UNVERIFIED");
  if (externalBlockers.length) state = "BLOCKED_EXTERNAL";
}

const result = {
  provider: "workos",
  scope,
  state,
  ready: state === "PASS",
  productionState,
  billingAddressConfigured: billingAddress,
  paymentMethodConfigured: paymentMethod,
  expected,
  runtime,
  productionWebhook: {
    ...productionWebhook,
    requiredEvents: [...REQUIRED_DIRECTORY_EVENTS],
    secretComparedWithoutDisclosure: true,
  },
  issuerReachable,
  issuerError,
  redirectMatches,
  mcpResourceMatches,
  externalBlockers,
};

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
if (state === "FAIL" || (process.argv.includes("--require") && state !== "PASS")) process.exitCode = 2;
