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

export function workosWebhookTargetForRequestUrl(requestUrl: string) {
  const origin = normalizeOrigin(requestUrl);
  return origin ? `${origin}/api/webhooks/workos` : null;
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
  explicitSecret?: string;
  fetchImpl?: FetchLike;
} = {}) {
  const apiKey = options.apiKey ?? process.env.WORKOS_API_KEY?.trim();
  const targetUrl = options.targetUrl ?? workosWebhookTargetUrl();
  if (!apiKey || !targetUrl) {
    return {
      ready: false,
      targetUrl: targetUrl ?? null,
      endpointId: null,
      secretMatchesExplicit: options.explicitSecret?.trim() ? false : null,
      error: !apiKey ? "WORKOS_API_KEY_MISSING" : "WORKOS_WEBHOOK_TARGET_MISSING",
    };
  }

  try {
    const endpoints = await listEndpoints(apiKey, options.fetchImpl ?? fetch);
    const endpoint = readyEndpoint(endpoints, targetUrl);
    const explicit = options.explicitSecret?.trim();
    const secretMatchesExplicit = explicit
      ? Boolean(endpoint?.secret && endpoint.secret === explicit)
      : null;
    return {
      ready: Boolean(endpoint) && (secretMatchesExplicit ?? true),
      targetUrl,
      endpointId: endpoint?.id ?? null,
      secretMatchesExplicit,
      error: endpoint
        ? (secretMatchesExplicit === false ? "WORKOS_WEBHOOK_SECRET_MISMATCH" : null)
        : "WORKOS_WEBHOOK_ENDPOINT_NOT_READY",
    };
  } catch (error) {
    return {
      ready: false,
      targetUrl,
      endpointId: null,
      secretMatchesExplicit: options.explicitSecret?.trim() ? false : null,
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


export async function ensureWorkosWebhookEndpoint(options: {
  apiKey?: string;
  targetUrl: string;
  endpointId?: string;
  fetchImpl?: FetchLike;
}) {
  const apiKey = options.apiKey ?? process.env.WORKOS_API_KEY?.trim();
  if (!apiKey) throw new Error("WORKOS_API_KEY_MISSING");
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoints = await listEndpoints(apiKey, fetchImpl);
  const selected = options.endpointId
    ? endpoints.find((endpoint) => endpoint.id === options.endpointId)
    : endpoints.find((endpoint) => endpoint.endpoint_url === options.targetUrl);

  if (options.endpointId && !selected) {
    throw new Error("WORKOS_WEBHOOK_ENDPOINT_ID_NOT_FOUND");
  }

  const body = {
    endpoint_url: options.targetUrl,
    events: [...REQUIRED_WORKOS_DIRECTORY_EVENTS],
    status: "enabled",
  };

  if (!selected) {
    const response = await fetchImpl("https://api.workos.com/webhook_endpoints", {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        endpoint_url: options.targetUrl,
        events: [...REQUIRED_WORKOS_DIRECTORY_EVENTS],
      }),
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error(`WORKOS_WEBHOOK_CREATE_HTTP_${response.status}`);
    const created = await response.json() as WorkosWebhookEndpoint;
    if (!created.id || created.endpoint_url !== options.targetUrl || !created.secret) {
      throw new Error("WORKOS_WEBHOOK_CREATE_INCOMPLETE");
    }
    secretCache.set(options.targetUrl, { secret: created.secret, expiresAt: Date.now() + CACHE_MS });
    return { action: "created" as const, endpointId: created.id, targetUrl: options.targetUrl };
  }

  const alreadyReady = (
    selected.endpoint_url === options.targetUrl
    && selected.status === "enabled"
    && exactWorkosDirectoryEventSet(selected.events)
    && typeof selected.secret === "string"
    && selected.secret.length > 0
  );
  if (alreadyReady) {
    secretCache.set(options.targetUrl, { secret: selected.secret!, expiresAt: Date.now() + CACHE_MS });
    return { action: "already_configured" as const, endpointId: selected.id ?? null, targetUrl: options.targetUrl };
  }

  if (!selected.id) throw new Error("WORKOS_WEBHOOK_ENDPOINT_ID_MISSING");
  const response = await fetchImpl(`https://api.workos.com/webhook_endpoints/${encodeURIComponent(selected.id)}`, {
    method: "PATCH",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`WORKOS_WEBHOOK_UPDATE_HTTP_${response.status}`);
  const updated = await response.json() as WorkosWebhookEndpoint;
  if (
    updated.endpoint_url !== options.targetUrl
    || updated.status !== "enabled"
    || !exactWorkosDirectoryEventSet(updated.events)
    || !updated.secret
  ) {
    throw new Error("WORKOS_WEBHOOK_UPDATE_INCOMPLETE");
  }
  secretCache.set(options.targetUrl, { secret: updated.secret, expiresAt: Date.now() + CACHE_MS });
  return { action: "updated" as const, endpointId: updated.id ?? selected.id, targetUrl: options.targetUrl };
}
