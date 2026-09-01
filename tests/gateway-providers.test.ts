import { describe, expect, it } from "vitest";
import { normalizeCompatibilityRequest } from "@/lib/gateway/compat";
import { GATEWAY_PROVIDERS, parseSseUsage } from "@/lib/gateway/providers";

describe("gateway provider usage normalization", () => {
  it("separates OpenAI cached input and observes inclusive reasoning details", () => {
    const usage = GATEWAY_PROVIDERS.openai.normalizeUsage({
      id: "resp_test",
      model: "gpt-test",
      usage: {
        input_tokens: 1_000,
        input_tokens_details: { cached_tokens: 400 },
        output_tokens: 300,
        output_tokens_details: { reasoning_tokens: 120 },
        total_tokens: 1_300,
      },
    });
    expect(usage).toEqual({
      freshInputTokens: 600,
      cacheReadTokens: 400,
      cacheWriteTokens: null,
      reasoningTokens: 120,
      outputTokens: 300,
      totalTokens: 1_300,
    });
  });

  it("keeps Anthropic cache reads/writes separate from fresh input and reads thinking details", () => {
    const usage = GATEWAY_PROVIDERS.anthropic.normalizeUsage({
      usage: {
        input_tokens: 50,
        cache_read_input_tokens: 2_000,
        cache_creation_input_tokens: 500,
        output_tokens: 300,
        output_tokens_details: { thinking_tokens: 125 },
      },
    });
    expect(usage.freshInputTokens).toBe(50);
    expect(usage.cacheReadTokens).toBe(2_000);
    expect(usage.cacheWriteTokens).toBe(500);
    expect(usage.reasoningTokens).toBe(125);
    expect(usage.outputTokens).toBe(300);
    expect(usage.totalTokens).toBe(2_850);
  });

  it("subtracts Gemini cached prompt content without double-counting thoughts", () => {
    const usage = GATEWAY_PROVIDERS.gemini.normalizeUsage({
      usageMetadata: {
        promptTokenCount: 1_000,
        cachedContentTokenCount: 400,
        candidatesTokenCount: 250,
        thoughtsTokenCount: 100,
        totalTokenCount: 1_350,
      },
    });
    expect(usage).toEqual({
      freshInputTokens: 600,
      cacheReadTokens: 400,
      cacheWriteTokens: null,
      reasoningTokens: 100,
      outputTokens: 250,
      totalTokens: 1_350,
    });
  });

  it("accepts Gemini responseTokenCount where that API surface uses the newer field name", () => {
    const usage = GATEWAY_PROVIDERS.gemini.normalizeUsage({
      usageMetadata: { promptTokenCount: 10, responseTokenCount: 5, thoughtsTokenCount: 2 },
    });
    expect(usage.outputTokens).toBe(5);
    expect(usage.totalTokens).toBe(17);
  });

  it("extracts the final usage-bearing OpenAI SSE response", () => {
    const usage = parseSseUsage(GATEWAY_PROVIDERS.openai, [
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":"hello"}',
      '',
      'event: response.completed',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":100,"input_tokens_details":{"cached_tokens":20},"output_tokens":30,"output_tokens_details":{"reasoning_tokens":10},"total_tokens":130}}}',
      '',
      'data: [DONE]',
    ].join("\n"));
    expect(usage.freshInputTokens).toBe(80);
    expect(usage.cacheReadTokens).toBe(20);
    expect(usage.outputTokens).toBe(30);
    expect(usage.reasoningTokens).toBe(10);
    expect(usage.totalTokens).toBe(130);
  });

  it("classifies bounded retry statuses consistently", () => {
    expect(GATEWAY_PROVIDERS.openai.retryable(429)).toBe(true);
    expect(GATEWAY_PROVIDERS.anthropic.retryable(503)).toBe(true);
    expect(GATEWAY_PROVIDERS.gemini.retryable(408)).toBe(true);
    expect(GATEWAY_PROVIDERS.openai.retryable(400)).toBe(false);
    expect(GATEWAY_PROVIDERS.gemini.retryable(409)).toBe(false);
  });
});

describe("drop-in gateway compatibility", () => {
  const request = (surface: string) => new Request(`https://token.example.com/v1/${surface}`, {
    method: "POST",
    headers: {
      authorization: "Bearer ti_live_test",
      "content-type": "application/json",
      "x-ti-provider-connection-id": "pcn_12345678",
      "x-ti-project-id": "proj_123",
    },
  });

  it("normalizes OpenAI chat requests without requiring provider credentials from the client", () => {
    const raw = { model: "gpt-5.6-luna", messages: [{ role: "user", content: "hello" }], max_completion_tokens: 250, stream: true, tools: [{ type: "function", function: { name: "lookup" } }] };
    const normalized = normalizeCompatibilityRequest(request("chat/completions"), raw, { provider: "openai", surface: "chat_completions" });
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.body).toMatchObject({ providerConnectionId: "pcn_12345678", projectId: "proj_123", model: "gpt-5.6-luna", maxOutputTokens: 250, stream: true });
    expect(JSON.stringify(normalized.body)).not.toContain("sk-");
    const upstream = GATEWAY_PROVIDERS.openai.buildRequest({ model: raw.model, input: normalized.body.input, maxOutputTokens: 250, stream: true }, "provider-secret");
    expect(upstream.url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(String(upstream.init.body));
    expect(body.messages).toEqual(raw.messages);
    expect(body.tools).toEqual(raw.tools);
    expect(body.max_completion_tokens).toBe(250);
    expect(body.stream).toBe(true);
  });

  it("preserves OpenAI Responses request fields", () => {
    const raw = { model: "gpt-5.6-luna", input: "hello", max_output_tokens: 100, text: { format: { type: "text" } } };
    const normalized = normalizeCompatibilityRequest(request("responses"), raw, { provider: "openai", surface: "responses" });
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    const upstream = GATEWAY_PROVIDERS.openai.buildRequest({ model: raw.model, input: normalized.body.input, maxOutputTokens: 100 }, "provider-secret");
    expect(upstream.url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(upstream.init.body));
    expect(body.input).toBe("hello");
    expect(body.text).toEqual(raw.text);
  });

  it("preserves Anthropic Messages fields and routes to Anthropic", () => {
    const raw = { model: "claude-sonnet-5", messages: [{ role: "user", content: "hello" }], max_tokens: 200, system: "Be concise", tools: [{ name: "lookup", input_schema: { type: "object" } }] };
    const normalized = normalizeCompatibilityRequest(request("messages"), raw, { provider: "anthropic", surface: "messages" });
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    const upstream = GATEWAY_PROVIDERS.anthropic.buildRequest({ model: raw.model, input: normalized.body.input, maxOutputTokens: 200 }, "provider-secret");
    expect(upstream.url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(String(upstream.init.body));
    expect(body.messages).toEqual(raw.messages);
    expect(body.system).toBe("Be concise");
    expect(body.tools).toEqual(raw.tools);
  });

  it("fails closed when the BYOK provider connection is not selected", () => {
    const missing = new Request("https://token.example.com/v1/responses", { method: "POST" });
    const result = normalizeCompatibilityRequest(missing, { model: "gpt-5.6-luna", input: "hello" }, { provider: "openai", surface: "responses" });
    expect(result).toMatchObject({ ok: false, error: "TI_PROVIDER_CONNECTION_REQUIRED" });
  });
});
