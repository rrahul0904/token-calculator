import { describe, expect, it } from "vitest";
import { calculateCost } from "@/lib/cost";
import { MODEL_CATALOG } from "@/lib/models";

describe("long-context pricing", () => {
  it("automatically applies GPT-5.6 Sol long-context pricing above 272K input", () => {
    const model = MODEL_CATALOG.find((entry) => entry.id === "gpt-5.6-sol");
    expect(model).toBeTruthy();
    const result = calculateCost(model!, { inputTokens: 300_000, outputTokens: 10_000 });
    expect(result.pricingTier).toContain("Long context");
    expect(result.effectivePricing.input).toBe(8);
    expect(result.effectivePricing.output).toBe(30);
  });
  it("keeps base pricing below the threshold", () => {
    const model = MODEL_CATALOG.find((entry) => entry.id === "gpt-5.6-sol");
    const result = calculateCost(model!, { inputTokens: 200_000, outputTokens: 10_000 });
    expect(result.effectivePricing.input).toBe(4);
    expect(result.effectivePricing.output).toBe(20);
  });
});
