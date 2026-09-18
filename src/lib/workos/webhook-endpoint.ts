type FetchLike = typeof fetch;

export const REQUIRED_WORKOS_DIRECTORY_EVENTS = [
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

export type WorkosWebhookEndpoint = {
  id?: string;
  endpoint_url?: string;
  secret?: string;
  status?: string;
  events?: string[];
};

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

export function exactWorkosDirectoryEventSet(events: string[] | undefined) {
  const actual = [...(events ?? [])].sort();
  const expected = [...REQUIRED_WORKOS_DIRECTORY_EVENTS].sort();
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function workosWebhookTargetUrl(env: Readonly<Record<string, string | undefined>> = process.env) {
  let origin: string | null = null;

  if (env.VERCEL_ENV === "preview") {
    origin = normalizeOrigin(env.VERCEL_URL);
  }

  if (!origin && env.VERCEL_ENV === "production") {
    origin = normalizeOrigin(env.APP_BASE_URL) ?? normalizeOrigin(env.VERCEL_PROJECT_PRODUCTION_URL);
  }

  if (!origin) {
    origin = normalizeOrigin(env.APP_BASE_URL) ?? normalizeOrigin(env.VERCEL_URL);
  }

  return origin ? `${origin}/api/webhooks/workos` : null;
}

async function listEndpoints(apiKey: string, fetchImpl: FetchLike): Promise<WorkosWebhookEndpoint[]> {
  const response = await fetchImpl("https://api.workos.com/webhook_endpoints?limit=100", {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`WORKOS_WEBHOOK_LIST_HTTP_${response.status}`);
  const body = await response.json() as { data?: WorkosWebhookEndpoint[] };
  return Array.isArray(body.data) ? body.data : [];
}

function readyEndpoint(endpoints: WorkosWebhookEndpoint[], targetUrl: string) {
  return endpoints.find((endpoint) => (
    endpoint.endpoint_url === targetUrl
    && endpoint.status === "enabled"
    && exactWorkosDirectoryEventSet(endpoint.events)
    && typeof endpoint.secret === "string"
    && endpoint.secret.length > 0
  ));
}

const secretCache = new Map<string, { secret: string; expiresAt: number }>();
const CACHE_MS = 60_000;

export function clearWorkosWebhookCache() {
  secretCache.clear();
}

export async function inspectWorkosWebhookProvider(options: {
  apiKey?: string;
  targetUrl?: string | null;
  fetchImpl?: FetchLike;
} = {}) {
  const apiKey = options.apiKey ?? process.env.WORKOS_API_KEY?.trim();
  const targetUrl = options.targetUrl ?? workosWebhookTargetUrl();
  if (!apiKey || !targetUrl) {
    return {
      ready: false,
      targetUrl: targetUrl ?? null,
      endpointId: null,
      error: !apiKey ? "WORKOS_API_KEY_MISSING" : "WORKOS_WEBHOOK_TARGET_MISSING",
    };
  }

  try {
    const endpoints = await listEndpoints(apiKey, options.fetchImpl ?? fetch);
    const endpoint = readyEndpoint(endpoints, targetUrl);
    return {
      ready: Boolean(endpoint),
      targetUrl,
      endpointId: endpoint?.id ?? null,
      error: endpoint ? null : "WORKOS_WEBHOOK_ENDPOINT_NOT_READY",
    };
  } catch (error) {
    return {
      ready: false,
      targetUrl,
      endpointId: null,
      error: error instanceof Error ? error.message : "WORKOS_WEBHOOK_LOOKUP_FAILED",
    };
  }
}

export async function resolveWorkosWebhookSecret(options: {
  apiKey?: string;
  explicitSecret?: string;
  targetUrl?: string | null;
  fetchImpl?: FetchLike;
  forceRefresh?: boolean;
} = {}) {
  const explicit = options.explicitSecret ?? process.env.WORKOS_WEBHOOK_SECRET?.trim();
  if (explicit) return explicit;

  const apiKey = options.apiKey ?? process.env.WORKOS_API_KEY?.trim();
  const targetUrl = options.targetUrl ?? workosWebhookTargetUrl();
  if (!apiKey || !targetUrl) throw new Error("WORKOS_WEBHOOK_NOT_CONFIGURED");

  if (!options.forceRefresh) {
    const cached = secretCache.get(targetUrl);
    if (cached && cached.expiresAt > Date.now()) return cached.secret;
  }

  const endpoints = await listEndpoints(apiKey, options.fetchImpl ?? fetch);
  const endpoint = readyEndpoint(endpoints, targetUrl);
  if (!endpoint?.secret) throw new Error("WORKOS_WEBHOOK_ENDPOINT_NOT_READY");

  secretCache.set(targetUrl, { secret: endpoint.secret, expiresAt: Date.now() + CACHE_MS });
  return endpoint.secret;
}
