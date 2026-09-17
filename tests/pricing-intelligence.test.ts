import { describe, expect, it } from "vitest";
import { normalizeOpenRouterPayload } from "@/lib/pricing/openrouter";
import { endpointById, endpointsForModel, isPricingStale } from "@/lib/pricing/catalog";

describe("pricing intelligence", () => {
  it("normalizes OpenRouter per-token prices into per-million rates", () => {
    const rows = normalizeOpenRouterPayload({
      data: [{
        id: "openai/gpt-5.6-luna",
        name: "GPT-5.6 Luna",
        context_length: 1_050_000,
        top_provider: { max_completion_tokens: 128_000 },
        pricing: {
          prompt: "0.0000002",
          completion: "0.0000012",
          input_cache_read: "0.00000002",
          input_cache_write: "0",
        },
      }],
    }, "2026-09-11T12:00:00.000Z");
    expect(rows).toHaveLength(1);
    expect(rows[0].pricing).toEqual({ input: 0.2, output: 1.2, cachedInput: 0.02, cacheWrite: 0 });
    expect(rows[0].canonicalModelId).toBe("gpt-5.6-luna");
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

  it("keeps the bundled catalog direct-only until a routed refresh is published", () => {
    const endpoints = endpointsForModel("gpt-5.6-luna");
    expect(endpoints.length).toBeGreaterThan(0);
    expect(endpoints.every((endpoint) => endpoint.provenance.sourceType === "official_provider")).toBe(true);
    expect(endpointById("openrouter:openai/gpt-5.6-luna")).toBeNull();
  });

  it("marks stale pricing without changing its value", () => {
    const direct = endpointsForModel("gpt-5.6-luna")[0];
    expect(direct).toBeTruthy();
    expect(isPricingStale(direct.provenance, new Date("2027-01-01T00:00:00Z"))).toBe(true);
  });
});
