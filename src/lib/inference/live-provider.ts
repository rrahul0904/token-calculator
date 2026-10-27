import { createHash } from "node:crypto";

export const LIVE_INFERENCE_SOURCE = "inference_live_v1";
export const MAX_LIVE_INPUT_BYTES = 16_384;
export const MAX_LIVE_REQUEST_BYTES = 20_000;
export const MAX_LIVE_PROVIDER_RESPONSE_BYTES = 128 * 1024;

export type LiveMessage = { role: "system" | "user" | "assistant"; content: string };
export type LiveRequest = {
  model: string;
  messages: LiveMessage[];
  max_tokens: number;
};
type ParseResult = { ok: true; data: LiveRequest } | { ok: false; code: string };
export type UpstreamConfig = { endpoint: string; model: string; apiKey?: string; timeoutMs: number; lane: "local" | "approved_remote" };
export type LiveResult = { id: string; model: string; output: string; usage: { prompt_tokens: number; completion_tokens: number } | null; finish_reason: "stop" };

function hasOnlyKeys(raw: Record<string, unknown>, names: string[]): boolean {
  return Object.keys(raw).every((name) => names.includes(name));
}

export function parseLiveRequest(raw: unknown, approvedModel: string): ParseResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, code: "INVALID_REQUEST" };
  const value = raw as Record<string, unknown>;
  if (!hasOnlyKeys(value, ["model", "messages", "max_tokens", "store", "stream"])) return { ok: false, code: "UNSUPPORTED_FIELD" };
  if (value.model !== approvedModel) return { ok: false, code: "MODEL_NOT_APPROVED" };
  if (value.store !== false || value.stream === true) return { ok: false, code: "STORE_FALSE_AND_NONSTREAM_REQUIRED" };
  if (value.stream !== undefined && value.stream !== false) return { ok: false, code: "INVALID_STREAM" };
  if (!Number.isSafeInteger(value.max_tokens) || (value.max_tokens as number) < 1 || (value.max_tokens as number) > 2048) {
    return { ok: false, code: "MAX_TOKENS_INVALID" };
  }
  if (!Array.isArray(value.messages) || value.messages.length < 1 || value.messages.length > 16) {
    return { ok: false, code: "MESSAGES_INVALID" };
  }
  let bytes = 0;
  const messages: LiveMessage[] = [];
  for (const message of value.messages) {
    if (!message || typeof message !== "object" || Array.isArray(message)) return { ok: false, code: "MESSAGE_INVALID" };
    const entry = message as Record<string, unknown>;
    if (!hasOnlyKeys(entry, ["role", "content"]) || !["system", "user", "assistant"].includes(String(entry.role))) {
      return { ok: false, code: "MESSAGE_ROLE_NOT_APPROVED" };
    }
    if (typeof entry.content !== "string" || !entry.content.trim()) return { ok: false, code: "MESSAGE_CONTENT_INVALID" };
    bytes += Buffer.byteLength(entry.content, "utf8");
    if (bytes > MAX_LIVE_INPUT_BYTES) return { ok: false, code: "INPUT_TOO_LARGE" };
    messages.push({ role: entry.role as LiveMessage["role"], content: entry.content });
  }
  if (messages.at(-1)?.role !== "user") return { ok: false, code: "FINAL_MESSAGE_MUST_BE_USER" };
  return { ok: true, data: { model: approvedModel, messages, max_tokens: value.max_tokens as number } };
}

export function liveRequestDigest(request: LiveRequest): string {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

export function estimateReservedTokens(request: LiveRequest): { inputEstimate: number; reserve: number } {
  const bytes = request.messages.reduce((total, message) => total + Buffer.byteLength(message.content, "utf8"), 0);
  const inputEstimate = Math.ceil(bytes / 4) + request.messages.length * 12;
  return { inputEstimate, reserve: inputEstimate + request.max_tokens };
}

/** Egress is fully operator-controlled, not chosen by API callers. */
export function parseUpstreamConfig(env: NodeJS.ProcessEnv): UpstreamConfig {
  const model = env.TI_INFERENCE_UPSTREAM_MODEL || "";
  const base = env.TI_INFERENCE_UPSTREAM_BASE_URL || "";
  if (!/^[a-zA-Z0-9._:/-]{1,150}$/.test(model)) throw new Error("INFERENCE_MODEL_NOT_CONFIGURED");
  let url: URL;
  try { url = new URL(base); } catch { throw new Error("INFERENCE_UPSTREAM_URL_INVALID"); }
  if (url.username || url.password || url.search || url.hash) throw new Error("INFERENCE_UPSTREAM_URL_UNSAFE");
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("INFERENCE_UPSTREAM_PROTOCOL_DENIED");
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*v1\/?$/.test(url.pathname)) throw new Error("INFERENCE_UPSTREAM_V1_PATH_REQUIRED");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local && (url.protocol !== "https:" || url.origin !== env.TI_INFERENCE_UPSTREAM_ALLOWED_ORIGIN)) {
    throw new Error("INFERENCE_UPSTREAM_ORIGIN_NOT_APPROVED");
  }
  if (!local && env.TI_INFERENCE_PRIVATE_REMOTE_APPROVED !== "1") throw new Error("INFERENCE_PRIVATE_REMOTE_NOT_APPROVED");
  const timeout = Number(env.TI_INFERENCE_UPSTREAM_TIMEOUT_MS ?? 60000);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) throw new Error("INFERENCE_TIMEOUT_CONFIG_INVALID");
  return {
    endpoint: url.origin + url.pathname.replace(/\/+$/, "") + "/chat/completions",
    model,
    ...(env.TI_INFERENCE_UPSTREAM_API_KEY ? { apiKey: env.TI_INFERENCE_UPSTREAM_API_KEY } : {}),
    timeoutMs: timeout,
    lane: local ? "local" : "approved_remote",
  };
}

async function readBounded(response: Response): Promise<string> {
  const statedSize = Number(response.headers.get("content-length") ?? 0);
  if (statedSize > MAX_LIVE_PROVIDER_RESPONSE_BYTES) throw new Error("PROVIDER_RESPONSE_TOO_LARGE");
  if (!response.body) throw new Error("PROVIDER_EMPTY_BODY");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_LIVE_PROVIDER_RESPONSE_BYTES) throw new Error("PROVIDER_RESPONSE_TOO_LARGE");
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function callLiveProvider(
  config: UpstreamConfig,
  request: LiveRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<LiveResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: config.model, messages: request.messages, max_tokens: request.max_tokens, store: false, stream: false }),
      signal: controller.signal,
    });
    if (!response || response.status !== 200) throw new Error("PROVIDER_UNAVAILABLE_OR_REFUSED");
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new Error("PROVIDER_CONTENT_TYPE_INVALID");
    const raw = await readBounded(response);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new Error("PROVIDER_RESPONSE_INVALID"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("PROVIDER_RESPONSE_INVALID");
    const data = body as Record<string, unknown>;
    const choices = data.choices;
    if (!Array.isArray(choices) || choices.length !== 1) throw new Error("PROVIDER_RESPONSE_INVALID");
    const first = choices[0] as Record<string, unknown>;
    if (first?.finish_reason !== "stop") throw new Error("PROVIDER_RESPONSE_INCOMPLETE_OR_TOOL_CALL");
    const message = first.message as Record<string, unknown> | undefined;
    if (!message || (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) ||
      typeof message.content !== "string" || !message.content.trim() || Buffer.byteLength(message.content, "utf8") > 32_768) {
      throw new Error("PROVIDER_RESPONSE_INVALID");
    }
    const u = data.usage as Record<string, unknown> | undefined;
    const usage = u && Number.isSafeInteger(u.prompt_tokens) && Number.isSafeInteger(u.completion_tokens) &&
      (u.prompt_tokens as number) >= 0 && (u.completion_tokens as number) >= 0
      ? { prompt_tokens: u.prompt_tokens as number, completion_tokens: u.completion_tokens as number }
      : null;
    return { id: typeof data.id === "string" && /^[\w-]{1,128}$/.test(data.id) ? data.id : "provider_unidentified",
      model: config.model, output: message.content, usage, finish_reason: "stop" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (controller.signal.aborted) throw new Error("PROVIDER_TIMEOUT_OR_INTERRUPTED");
    if (message.startsWith("PROVIDER_")) throw e;
    // The upstream error body and input are never returned to an unauthenticated client or logs.
    throw new Error("PROVIDER_TRANSPORT_ERROR");
  } finally { clearTimeout(timer); }
}
