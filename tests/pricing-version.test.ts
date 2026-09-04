import { describe, expect, it } from "vitest";
import { calculateCost } from "@/lib/cost";
import { MODEL_CATALOG } from "@/lib/models";
import { resolvePricing } from "@/lib/pricing";

describe("effective-dated pricing", () => {
  const gemini36 = MODEL_CATALOG.find((model) => model.id === "gemini-3.6-flash")!;
  const sol = MODEL_CATALOG.find((model) => model.id === "gpt-5.6-sol")!;
  const gpt55Pro = MODEL_CATALOG.find((model) => model.id === "gpt-5.5-pro")!;

  it("resolves Gemini introductory pricing only inside its effective window", () => {
    expect(resolvePricing({ model: gemini36, inputTokens: 1000, at: new Date("2026-08-12T12:00:00Z") }).pricing.input).toBe(1.5);
    expect(resolvePricing({ model: gemini36, inputTokens: 1000, at: new Date("2026-08-13T00:00:00Z") }).pricing.input).toBe(0.75);
    expect(resolvePricing({ model: gemini36, inputTokens: 1000, at: new Date("2026-12-31T23:59:59Z") }).pricing.input).toBe(0.75);
    expect(resolvePricing({ model: gemini36, inputTokens: 1000, at: new Date("2027-01-01T00:00:00Z") }).pricing.input).toBe(1.5);
  });

  it("defines long-context thresholds as strictly greater than the published threshold", () => {
    expect(resolvePricing({ model: sol, inputTokens: 271_999, at: new Date("2026-09-04") }).pricing.input).toBe(4);
    expect(resolvePricing({ model: sol, inputTokens: 272_000, at: new Date("2026-09-04") }).pricing.input).toBe(4);
    expect(resolvePricing({ model: sol, inputTokens: 272_001, at: new Date("2026-09-04") }).pricing.input).toBe(8);
  });

  it("does not turn unavailable cache pricing into free input", () => {
    const result = calculateCost(gpt55Pro, {
      inputTokens: 100_000,
      cachedInputTokens: 100_000,
      outputTokens: 0,
      at: new Date("2026-09-04"),
    });
    expect(result.cachedInput).toBe(0);
    expect(result.input).toBeCloseTo(3);
    expect(result.total).toBeCloseTo(3);
  });
});
