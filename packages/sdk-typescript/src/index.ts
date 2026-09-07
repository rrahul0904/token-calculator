export type UsageSource = "provider_measured" | "agent_measured" | "local_tokenizer_reference" | "estimated" | "reconciled";

export interface TokenIntelligenceClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class TokenIntelligenceError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string, public readonly body?: unknown) {
    super(message);
    this.name = "TokenIntelligenceError";
  }
}

export interface EstimateInput {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  requestsPerMonth?: number;
  providers?: string[];
  models?: string[];
}

export interface RunCreateInput {
  projectId?: string | null;
  environment?: string;
  agentName: string;
  agentVendor?: string | null;
  workflowName?: string | null;
  startedAt?: string;
  estimatedCostUsd?: number | null;
  metadata?: Record<string, unknown>;
}

export interface BudgetCheckInput {
  projectId?: string | null;
  environment?: string;
  agent?: string;
  workflow?: string;
  runId?: string;
  observedCostUsd?: number;
  projectedNextCallCostUsd?: number;
  tokens?: number;
  turns?: number;
  retries?: number;
  failedToolCalls?: number;
  toolCalls?: number;
  provider?: string;
  model?: string;
  fallbackPremiumUsd?: number;
  isFallback?: boolean;
}

export interface GatewayInput {
  providerConnectionId: string;
  projectId?: string | null;
  runId?: string;
  agentName?: string;
  workflowName?: string | null;
  environment?: string;
  model: string;
  fallbackModel?: string;
  input: unknown;
  maxOutputTokens?: number;
  stream?: boolean;
  temperature?: number;
  metadata?: Record<string, string>;
}

type RequestOptions = { method?: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> };

export class TokenIntelligenceClient {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TokenIntelligenceClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://token-intelligence-eight.vercel.app").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new Error("Token Intelligence request timed out")), this.timeoutMs);
    const combined = options.signal ? AbortSignal.any([timeout.signal, options.signal]) : timeout.signal;
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method ?? (options.body === undefined ? "GET" : "POST"),
        headers: { ...(this.apiKey ? { "authorization": `Bearer ${this.apiKey}` } : {}), "accept": "application/json", ...(options.body === undefined ? {} : { "content-type": "application/json" }), ...(options.headers ?? {}) },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: combined,
        cache: "no-store",
      });
      const contentType = response.headers.get("content-type") ?? "";
      const body = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text();
      if (!response.ok) {
        const record = body && typeof body === "object" ? body as Record<string, unknown> : null;
        const code = typeof record?.error === "string" ? record.error : undefined;
        throw new TokenIntelligenceError(code ?? `Token Intelligence request failed (${response.status})`, response.status, code, body);
      }
      return body as T;
    } finally {
      clearTimeout(timer);
    }
  }

  tokenize = (input: { text: string; model?: string; includePieces?: boolean; maxPieces?: number }, signal?: AbortSignal) => this.request<unknown>("/api/v1/tokenize", { body: input, signal });
  models = {
    list: (signal?: AbortSignal) => this.request<unknown>("/api/v1/models", { signal }),
    get: (id: string, signal?: AbortSignal) => this.request<unknown>(`/api/v1/models/${encodeURIComponent(id)}`, { signal }),
    pricingHistory: (id: string, signal?: AbortSignal) => this.request<unknown>(`/api/v1/models/${encodeURIComponent(id)}/pricing-history`, { signal }),
  };
  estimate = (input: EstimateInput, signal?: AbortSignal) => this.request<unknown>("/api/v1/estimate", { body: input, signal });
  compare = (input: Record<string, unknown>, signal?: AbortSignal) => this.request<unknown>("/api/v1/compare", { body: input, signal });
  recommend = (input: Record<string, unknown>, signal?: AbortSignal) => this.request<unknown>("/api/v1/recommend", { body: input, signal });
  usage = { get: (signal?: AbortSignal) => this.request<unknown>("/api/v1/usage", { signal }) };
  runs = {
    list: (signal?: AbortSignal) => this.request<unknown>("/api/v1/runs", { signal }),
    get: (id: string, signal?: AbortSignal) => this.request<unknown>(`/api/v1/runs/${encodeURIComponent(id)}`, { signal }),
    create: (input: RunCreateInput, signal?: AbortSignal) => this.request<unknown>("/api/v1/runs", { body: input, signal }),
  };
  events = {
    ingest: (event: Record<string, unknown>, signal?: AbortSignal) => this.request<unknown>("/api/v1/events", { body: event, signal }),
    batch: (events: Record<string, unknown>[], signal?: AbortSignal) => this.request<unknown>("/api/v1/events/batch", { body: { events }, signal }),
  };
  budgets = {
    check: (input: BudgetCheckInput, signal?: AbortSignal) => this.request<unknown>("/api/v1/budgets/check", { body: input, signal }),
    list: (signal?: AbortSignal) => this.request<unknown>("/api/v1/budgets", { signal }),
  };

  async gateway(provider: "openai" | "anthropic" | "gemini", input: GatewayInput, signal?: AbortSignal): Promise<Response> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new Error("Token Intelligence gateway request timed out")), Math.max(this.timeoutMs, 120_000));
    const combined = signal ? AbortSignal.any([timeout.signal, signal]) : timeout.signal;
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/gateway/${provider}`, {
        method: "POST",
        headers: { ...(this.apiKey ? { "authorization": `Bearer ${this.apiKey}` } : {}), "content-type": "application/json" },
        body: JSON.stringify(input),
        signal: combined,
        cache: "no-store",
      });
      if (!response.ok && !input.stream) {
        const body = await response.clone().json().catch(() => null);
        const code = body && typeof body === "object" && typeof (body as Record<string, unknown>).error === "string" ? String((body as Record<string, unknown>).error) : undefined;
        throw new TokenIntelligenceError(code ?? `Gateway request failed (${response.status})`, response.status, code, body);
      }
      return response;
    } finally { clearTimeout(timer); }
  }
}
