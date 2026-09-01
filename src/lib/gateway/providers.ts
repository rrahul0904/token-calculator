import type { GatewayProviderName } from "@/lib/gateway/provider-connectivity";

export interface GatewayUsage {
  freshInputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface GatewayRequest {
  model: string;
  input: unknown;
  maxOutputTokens?: number;
  stream?: boolean;
  temperature?: number;
  metadata?: Record<string, string>;
}

export interface GatewayUpstream {
  url: string;
  init: RequestInit;
}

export interface GatewayProviderAdapter {
  provider: GatewayProviderName;
  buildRequest(request: GatewayRequest, credential: string): GatewayUpstream;
  normalizeUsage(payload: unknown): GatewayUsage;
  providerRequestId(payload: unknown, response: Response): string | null;
  resolvedModel(payload: unknown, requestedModel: string): string;
  retryable(status: number): boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}
function sumKnown(...values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}
function userText(input: unknown): string {
  if (typeof input === "string") return input;
  return JSON.stringify(input);
}

const openai: GatewayProviderAdapter = {
  provider: "openai",
  buildRequest(request, credential) {
    return {
      url: "https://api.openai.com/v1/responses",
      init: {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${credential}` },
        body: JSON.stringify({
          model: request.model,
          input: request.input,
          max_output_tokens: request.maxOutputTokens,
          stream: request.stream ?? false,
          temperature: request.temperature,
          metadata: request.metadata,
        }),
      },
    };
  },
  normalizeUsage(payload) {
    const root = record(payload);
    const usage = record(root?.usage);
    const inputDetails = record(usage?.input_tokens_details);
    const outputDetails = record(usage?.output_tokens_details);
    const input = num(usage?.input_tokens);
    const cached = num(inputDetails?.cached_tokens);
    const reasoning = num(outputDetails?.reasoning_tokens);
    const output = num(usage?.output_tokens);
    return {
      freshInputTokens: input === null ? null : Math.max(input - (cached ?? 0), 0),
      cacheReadTokens: cached,
      cacheWriteTokens: null,
      reasoningTokens: reasoning,
      outputTokens: output,
      totalTokens: num(usage?.total_tokens) ?? sumKnown(input, output),
    };
  },
  providerRequestId(payload, response) {
    return str(record(payload)?.id) ?? response.headers.get("x-request-id");
  },
  resolvedModel(payload, requestedModel) { return str(record(payload)?.model) ?? requestedModel; },
  retryable(status) { return status === 408 || status === 409 || status === 429 || status >= 500; },
};

const anthropic: GatewayProviderAdapter = {
  provider: "anthropic",
  buildRequest(request, credential) {
    return {
      url: "https://api.anthropic.com/v1/messages",
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": credential,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: request.maxOutputTokens ?? 4096,
          messages: Array.isArray(request.input) ? request.input : [{ role: "user", content: userText(request.input) }],
          stream: request.stream ?? false,
          temperature: request.temperature,
          metadata: request.metadata ? { user_id: request.metadata.user_id } : undefined,
        }),
      },
    };
  },
  normalizeUsage(payload) {
    const root = record(payload);
    const usage = record(root?.usage);
    const outputDetails = record(usage?.output_tokens_details);
    const input = num(usage?.input_tokens);
    const cacheRead = num(usage?.cache_read_input_tokens);
    const cacheWrite = num(usage?.cache_creation_input_tokens);
    const output = num(usage?.output_tokens);
    return {
      freshInputTokens: input,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      reasoningTokens: num(outputDetails?.thinking_tokens),
      outputTokens: output,
      totalTokens: sumKnown(input, cacheRead, cacheWrite, output),
    };
  },
  providerRequestId(payload, response) {
    return str(record(payload)?.id) ?? response.headers.get("request-id");
  },
  resolvedModel(payload, requestedModel) { return str(record(payload)?.model) ?? requestedModel; },
  retryable(status) { return status === 408 || status === 409 || status === 429 || status >= 500; },
};

const gemini: GatewayProviderAdapter = {
  provider: "gemini",
  buildRequest(request, credential) {
    const method = request.stream ? "streamGenerateContent?alt=sse" : "generateContent";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:${method}`;
    return {
      url: endpoint,
      init: {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": credential },
        body: JSON.stringify({
          contents: Array.isArray(request.input) ? request.input : [{ role: "user", parts: [{ text: userText(request.input) }] }],
          generationConfig: {
            maxOutputTokens: request.maxOutputTokens,
            temperature: request.temperature,
          },
        }),
      },
    };
  },
  normalizeUsage(payload) {
    const root = record(payload);
    const usage = record(root?.usageMetadata);
    const prompt = num(usage?.promptTokenCount);
    const cached = num(usage?.cachedContentTokenCount);
    const output = num(usage?.candidatesTokenCount ?? usage?.responseTokenCount);
    const reasoning = num(usage?.thoughtsTokenCount);
    return {
      freshInputTokens: prompt === null ? null : Math.max(prompt - (cached ?? 0), 0),
      cacheReadTokens: cached,
      cacheWriteTokens: null,
      reasoningTokens: reasoning,
      outputTokens: output,
      totalTokens: num(usage?.totalTokenCount) ?? sumKnown(prompt, output, reasoning),
    };
  },
  providerRequestId(_payload, response) { return response.headers.get("x-request-id") ?? response.headers.get("x-goog-request-id"); },
  resolvedModel(_payload, requestedModel) { return requestedModel; },
  retryable(status) { return status === 408 || status === 429 || status >= 500; },
};

export const GATEWAY_PROVIDERS: Record<GatewayProviderName, GatewayProviderAdapter> = { openai, anthropic, gemini };

export function providerForName(provider: string): GatewayProviderAdapter | null {
  return provider === "openai" || provider === "anthropic" || provider === "gemini" ? GATEWAY_PROVIDERS[provider] : null;
}

export function parseSseUsage(provider: GatewayProviderAdapter, text: string): GatewayUsage {
  const lines = text.split(/\r?\n/);
  let latest: GatewayUsage = { freshInputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, outputTokens: null, totalTokens: null };
  for (const line of lines) {
    const raw = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
    if (!raw || raw === "[DONE]" || (!raw.startsWith("{") && !raw.startsWith("["))) continue;
    try {
      const parsed = JSON.parse(raw);
      const candidate = provider.provider === "openai" && record(parsed)?.response ? record(parsed)?.response : parsed;
      const next = provider.normalizeUsage(candidate);
      if (Object.values(next).some((value) => value !== null)) latest = next;
    } catch {
      // Streaming chunks may be partial or non-JSON event lines. They are deliberately ignored.
    }
  }
  return latest;
}
