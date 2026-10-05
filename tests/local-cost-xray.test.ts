import { describe, expect, it, vi } from "vitest";
import {
  analyzeCostXrayReceipt,
  captureLocalRequestEventSafely,
  createMetadataOnlyReceiptStore,
  normalizeLocalRequestEvent,
} from "@/lib/telemetry/local-cost-xray";

describe("local cost-xray metadata collector", () => {
  it("normalizes OpenAI usage, cache, MCP overhead, and context occupancy without retaining content", () => {
    const raw = {
      provider: "Azure OpenAI",
      request: { model: "gpt-test", system: "private system", input: "private input", messages: [{ role: "user", content: "private prompt" }], api_key: "never persist" },
      response: {
        model: "gpt-test",
        output: "private output",
        usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 30 }, completion_tokens_details: { reasoning_tokens: 4 } },
        choices: [{ message: { content: "private answer" } }],
      },
      contextWindowTokens: 1_000,
      mcpTools: [{ serverRef: "mcp-local", toolRef: "search", tokens: 8, invoked: false }],
    };
    const store = createMetadataOnlyReceiptStore();
    const result = captureLocalRequestEventSafely(raw, store);

    expect(result?.provider).toBe("openai");
    expect(result?.receipt.providerUsage).toEqual({ inputTokens: 100, outputTokens: 20, reasoningTokens: 4 });
    expect(result?.analysis.reconciliation.valid).toBe(true);
    expect(result?.analysis.context).toEqual({ occupiedTokens: 100, windowTokens: 1_000, occupancyRatio: 0.1 });
    expect(result?.analysis.cache).toMatchObject({ freshTokens: 62, readTokens: 30 });
    expect(result?.analysis.mcpOverhead).toMatchObject({ schemaTokens: 8, toolSchemas: 1, unusedTools: 1 });
    expect(result?.redaction).toMatchObject({ redactedBeforePersistence: true, rawContentPersisted: false, classification: "key_name_heuristic", credentialFieldsDiscarded: 1, contentFieldsDiscarded: 7, retention: "metadata_only" });
    expect(JSON.stringify(store.list())).not.toContain("private prompt");
    expect(JSON.stringify(store.list())).not.toContain("never persist");
    expect(JSON.stringify(store.list())).not.toContain("private answer");
  });

  it("normalizes Anthropic cache read/write input and preserves unknown attribution", () => {
    const normalized = normalizeLocalRequestEvent({
      provider: "claude",
      request: { model: "claude-test", system: "do not retain" },
      response: { usage: { input_tokens: 10, cache_read_input_tokens: 4, cache_creation_input_tokens: 3, output_tokens: 5 } },
      contextWindowTokens: 50,
    });
    expect(normalized.receipt.providerUsage).toEqual({ inputTokens: 17, outputTokens: 5, reasoningTokens: null });
    expect(analyzeCostXrayReceipt(normalized.receipt).cache).toMatchObject({ freshTokens: 10, readTokens: 4, writeTokens: 3 });
    expect(normalized.receipt.spans.some((span) => span.category === "unattributed_input")).toBe(true);
  });

  it("does not count explicit cache spans twice against provider cache totals", () => {
    const normalized = normalizeLocalRequestEvent({
      provider: "openai",
      request: { model: "gpt-test" },
      response: { usage: { input_tokens: 100, output_tokens: 5, input_tokens_details: { cached_tokens: 30 } } },
      spans: [
        { spanRef: "cached", category: "user_content", tokens: 30, cacheState: "read", confidence: "measured" },
        { spanRef: "fresh", category: "system_prompt", tokens: 70, cacheState: "fresh", confidence: "estimated" },
      ],
    });

    expect(analyzeCostXrayReceipt(normalized.receipt).reconciliation.valid).toBe(true);
    expect(analyzeCostXrayReceipt(normalized.receipt).cache).toMatchObject({ freshTokens: 70, readTokens: 30, writeTokens: 0, unknownTokens: 0 });
  });

  it("normalizes Gemini usage metadata and reports absent context window as unknown", () => {
    const normalized = normalizeLocalRequestEvent({
      provider: "Gemini",
      request: { model: "gemini-test" },
      response: { usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 6, cachedContentTokenCount: 2, thoughtsTokenCount: 1 } },
    });
    expect(normalized.receipt.providerUsage).toEqual({ inputTokens: 12, outputTokens: 6, reasoningTokens: 1 });
    expect(analyzeCostXrayReceipt(normalized.receipt).context).toMatchObject({ occupiedTokens: 12, windowTokens: null, occupancyRatio: null });
  });

  it("replaces caller-provided span and MCP identifiers with opaque local references", () => {
    const store = createMetadataOnlyReceiptStore();
    const result = captureLocalRequestEventSafely({
      provider: "openai",
      request: { model: "gpt-test" },
      response: { usage: { input_tokens: 2, output_tokens: 1 } },
      spans: [{ spanRef: "customer@example.com prompt", category: "tool_schema", tokens: 1, confidence: "estimated", serverRef: "secret-server-name", toolRef: "private tool text", invoked: false }],
      mcpTools: [{ serverRef: "secret-server-name", toolRef: "private tool text", tokens: 1, invoked: true }],
    }, store);
    expect(result?.analysis.reconciliation.valid).toBe(true);
    const persisted = JSON.stringify(store.list());
    expect(persisted).not.toContain("customer@example.com");
    expect(persisted).not.toContain("secret-server-name");
    expect(persisted).not.toContain("private tool text");
  });

  it("discards content from storage and fails open for unsupported or malformed optional telemetry", () => {
    const store = createMetadataOnlyReceiptStore();
    const malformed = { provider: "unknown", request: {}, response: {} };
    expect(captureLocalRequestEventSafely(malformed, store)).toBeNull();
    expect(store.list()).toEqual([]);
  });

  it("does not let a persistence failure escape into the provider request path", () => {
    const store = { append: vi.fn(() => { throw new Error("storage unavailable"); }), list: () => [] };
    expect(captureLocalRequestEventSafely({
      provider: "openai",
      request: { model: "gpt-test" },
      response: { usage: { input_tokens: 2, output_tokens: 1 } },
    }, store)).toBeNull();
    expect(store.append).toHaveBeenCalledOnce();
  });

  it("bounds local retention and evicts the oldest metadata record", () => {
    const store = createMetadataOnlyReceiptStore(1);
    for (const inputTokens of [2, 4]) {
      expect(captureLocalRequestEventSafely({
        provider: "openai",
        request: { model: "gpt-test" },
        response: { usage: { input_tokens: inputTokens, output_tokens: 1 } },
      }, store)).not.toBeNull();
    }
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.receipt.providerUsage.inputTokens).toBe(4);
    expect(() => createMetadataOnlyReceiptStore(0)).toThrow();
  });
});
