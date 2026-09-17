import { describe, expect, it } from "vitest";
import { analyzeBatchTextFiles, BATCH_MAX_FILE_BYTES } from "@/lib/planning/batch-analysis";
import { buildShareUrl, decodeShareState, encodeShareState } from "@/lib/planning/share-state";

describe("gap-closure planning utilities", () => {
  it("round-trips versioned content-free share state", () => {
    const encoded = encodeShareState({ modelId: "gpt-5.6-luna", inputTokens: 1200, outputTokens: 200, requestsPerMonth: 5000, allowedProviders: ["OpenAI"] });
    const decoded = decodeShareState(encoded);
    expect(decoded.v).toBe(1);
    expect(decoded.modelId).toBe("gpt-5.6-luna");
    expect(buildShareUrl("https://example.com/app/cost-lab", decoded)).toContain("state=");
  });

  it("rejects malformed and sensitive share payloads", () => {
    expect(() => decodeShareState("not*base64")).toThrow();
    expect(() => encodeShareState({ prompt: "secret" } as never)).toThrow(/SENSITIVE_SHARE_STATE_KEY/);
  });

  it("analyzes supported text files locally and aggregates totals", () => {
    const result = analyzeBatchTextFiles([
      { name: "one.txt", text: "hello world" },
      { name: "two.md", text: "# Heading\nSome content" },
    ], { modelId: "gpt-5.6-luna", outputTokens: 100 });
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((row) => row.precision === "local_tokenizer_reference")).toBe(true);
    expect(result.totals.referenceTokens).toBeGreaterThan(0);
    expect(result.privacy).toEqual({ processedLocally: true, contentUploaded: false });
  });

  it("rejects unsupported, binary, and oversized batch files", () => {
    expect(() => analyzeBatchTextFiles([{ name: "image.png", text: "x" }], { modelId: "gpt-5.6-luna" })).toThrow(/UNSUPPORTED_BATCH_FILE/);
    expect(() => analyzeBatchTextFiles([{ name: "binary.log", text: "x\u0000y" }], { modelId: "gpt-5.6-luna" })).toThrow(/BINARY_CONTENT_REJECTED/);
    expect(() => analyzeBatchTextFiles([{ name: "large.txt", text: "x", sizeBytes: BATCH_MAX_FILE_BYTES + 1 }], { modelId: "gpt-5.6-luna" })).toThrow(/BATCH_FILE_TOO_LARGE/);
  });
});
