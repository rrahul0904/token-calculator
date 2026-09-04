import { describe, expect, it } from "vitest";
import { normalizeOpenRouterPayload } from "@/lib/pricing/openrouter";
import { endpointById, endpointsForModel, isPricingStale } from "@/lib/pricing/catalog";

describe("pricing intelligence", () => {
  it("normalizes OpenRouter per-token prices into per-million rates", () => {
    const rows = normalizeOpenRouterPayload({
      data: [{
        id: "z-ai/glm-5.3-flash",
        name: "GLM 5.3 Flash",
        context_length: 1_310_720,
        top_provider: { max_completion_tokens: 131_072 },
        pricing: {
          prompt: "0.000000075",
          completion: "0.00000025",
          input_cache_read: "0.000000015",
          input_cache_write: "0",
        },
      }],
    }, "2026-09-04T12:00:00.000Z");
    expect(rows).toHaveLength(1);
    expect(rows[0].pricing).toEqual({ input: 0.075, output: 0.25, cachedInput: 0.015, cacheWrite: 0 });
    expect(rows[0].canonicalModelId).toBe("glm-5.3-flash");
  });

  it("rejects unusable catalogs rather than publishing empty pricing", () => {
    expect(() => normalizeOpenRouterPayload({ data: [] })).toThrow("OPENROUTER_EMPTY_CATALOG");
  });

  it("keeps blank, malformed and negative prices unknown instead of zero", () => {
    const rows = normalizeOpenRouterPayload({
      data: [{
        id: "vendor/test",
        name: "Test",
        pricing: { prompt: "", completion: "not-a-price", input_cache_read: "-0.01" },
      }],
    });
    expect(rows[0].pricing.input).toBeNull();
    expect(rows[0].pricing.output).toBeNull();
    expect(rows[0].pricing.cachedInput).toBeNull();
  });

  it("rejects duplicate upstream model ids deterministically", () => {
    expect(() => normalizeOpenRouterPayload({
      data: [
        { id: "vendor/test", name: "A", pricing: { prompt: "0.000001", completion: "0.000002" } },
        { id: "vendor/test", name: "B", pricing: { prompt: "0.000001", completion: "0.000002" } },
      ],
    })).toThrow("OPENROUTER_DUPLICATE_MODEL_ID");
  });

  it("keeps canonical model and routed endpoint identity separate", () => {
    expect(endpointsForModel("glm-5.3-flash").length).toBeGreaterThanOrEqual(2);
    const routed = endpointById("openrouter:z-ai/glm-5.3-flash");
    expect(routed?.modelId).toBe("glm-5.3-flash");
    expect(routed?.inferenceProvider).toBe("OpenRouter");
  });

  it("marks time-bounded routed pricing stale without changing its value", () => {
    const routed = endpointById("openrouter:z-ai/glm-5.3-flash")!;
    expect(isPricingStale(routed.provenance, new Date("2026-09-06T12:00:00Z"))).toBe(true);
  });
});
