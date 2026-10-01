import { describe, expect, it } from "vitest";
import { captureWireAttributionSafely, reconcileWireAttribution } from "@/lib/telemetry/wire-attribution";

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1",
    captureMode: "imported_metadata",
    modelRef: "model-fixture",
    pricingVersion: null,
    contextWindowTokens: 200_000,
    providerUsage: { inputTokens: 10, outputTokens: 3, reasoningTokens: 1 },
    spans: [
      { spanRef: "system", category: "system_prompt", tokens: 4, cacheState: "read", confidence: "measured" },
      { spanRef: "tool", category: "tool_schema", tokens: 2, cacheState: "fresh", confidence: "estimated", serverRef: "mcp-a", toolRef: "search", invoked: true },
      { spanRef: "user", category: "user_content", tokens: 4, cacheState: "fresh", confidence: "measured" },
      { spanRef: "reasoning", category: "reasoning", tokens: 1, cacheState: "unknown", confidence: "measured" },
      { spanRef: "output", category: "output", tokens: 3, cacheState: "unknown", confidence: "measured" },
    ],
    privacy: { redactedBeforePersistence: true, rawContentPersisted: false, retention: "metadata_only" },
    ...overrides,
  };
}

describe("wire attribution receipts", () => {
  it("reconciles metadata and keeps cache, window occupancy, and tool use distinct", () => {
    expect(reconcileWireAttribution(receipt())).toEqual({
      valid: true, reason: "reconciled", contextOccupancyTokens: 14,
      inputDeltaTokens: 0, outputDeltaTokens: 0,
      cache: { freshTokens: 6, readTokens: 4, writeTokens: 0, unknownTokens: 0 },
      mcp: { toolSchemas: 1, invokedTools: 1, unusedTools: 0, invocationEvidenceComplete: true },
    });
  });

  it("accepts multiple distinct tool schemas but never claims unknown invocation as waste", () => {
    const value = receipt({ spans: [
      ...receipt().spans,
      { spanRef: "tool-two", category: "tool_schema", tokens: 2, cacheState: "fresh", confidence: "estimated", invoked: null },
    ] });
    expect(reconcileWireAttribution(value)).toMatchObject({
      valid: false, reason: "unattributed_delta",
      mcp: { toolSchemas: 2, unusedTools: 0, invocationEvidenceComplete: false },
    });
  });

  it("flags duplicate span identifiers and incomplete or mismatched usage", () => {
    expect(reconcileWireAttribution(receipt({ spans: [
      ...receipt().spans,
      { ...receipt().spans[0], spanRef: "system" },
    ] })).reason).toBe("duplicate_usage");
    expect(reconcileWireAttribution(receipt({ spans: receipt().spans.map((span, i) => i === 0 ? { ...span, tokens: null } : span) })).reason).toBe("incomplete_usage");
    expect(reconcileWireAttribution(receipt({ providerUsage: { inputTokens: 11, outputTokens: 3, reasoningTokens: 1 } })).reason).toBe("unattributed_delta");
  });

  it("rejects raw content, incomplete privacy receipts, and malformed counts", () => {
    expect(() => reconcileWireAttribution(receipt({ privacy: { redactedBeforePersistence: false, rawContentPersisted: true, retention: "full" } }))).toThrow();
    expect(() => reconcileWireAttribution({ ...receipt(), prompt: "private" })).toThrow();
    expect(() => reconcileWireAttribution(receipt({ providerUsage: { inputTokens: -1, outputTokens: 3, reasoningTokens: null } }))).toThrow();
  });

  it("fails open when optional telemetry capture fails", () => {
    expect(captureWireAttributionSafely(() => reconcileWireAttribution(receipt()))?.valid).toBe(true);
    expect(captureWireAttributionSafely(() => { throw new Error("telemetry unavailable"); })).toBeNull();
  });
});
