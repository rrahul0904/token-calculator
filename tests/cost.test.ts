import { describe, expect, it } from "vitest";
import { calculateCost, contextUsage, monthlyProjection } from "@/lib/cost";
import { MODEL_CATALOG } from "@/lib/models";

describe("cost engine", () => {
  const sol = MODEL_CATALOG.find((model) => model.id === "gpt-5.6-sol")!;

  it("calculates standard-tier uncached input and output cost", () => {
    const result = calculateCost(sol, { inputTokens: 100_000, outputTokens: 100_000 });
    expect(result.input).toBeCloseTo(0.4);
    expect(result.output).toBeCloseTo(2);
    expect(result.total).toBeCloseTo(2.4);
    expect(result.effectivePricing.input).toBe(4);
    expect(result.effectivePricing.output).toBe(20);
  });

  it("moves cached tokens out of the uncached input bucket below the long-context threshold", () => {
    const result = calculateCost(sol, { inputTokens: 200_000, cachedInputTokens: 100_000, outputTokens: 0 });
    expect(result.input).toBeCloseTo(0.4);
    expect(result.cachedInput).toBeCloseTo(0.04);
    expect(result.total).toBeCloseTo(0.44);
  });

  it("caps cached tokens at total input", () => {
    const result = calculateCost(sol, { inputTokens: 100, cachedInputTokens: 500, outputTokens: 0 });
    expect(result.input).toBe(0);
    expect(result.cachedInput).toBeCloseTo((100 / 1_000_000) * 0.4);
  });

  it("calculates context utilization and monthly projection", () => {
    expect(contextUsage(750, 250, 2_000)).toBe(50);
    expect(monthlyProjection(0.01, 10_000)).toBe(100);
  });
});
