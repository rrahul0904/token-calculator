import { describe, expect, it } from "vitest";
import { calculateCost, contextUsage, monthlyProjection } from "@/lib/cost";
import { MODEL_CATALOG } from "@/lib/models";

describe("cost engine", () => {
  const sol = MODEL_CATALOG.find((model) => model.id === "gpt-5.6-sol")!;

  it("calculates uncached input and output cost per million tokens", () => {
    const result = calculateCost(sol, { inputTokens: 1_000_000, outputTokens: 100_000 });
    expect(result.input).toBeCloseTo(4);
    expect(result.output).toBeCloseTo(2);
    expect(result.total).toBeCloseTo(6);
  });

  it("moves cached tokens out of the uncached input bucket", () => {
    const result = calculateCost(sol, { inputTokens: 1_000_000, cachedInputTokens: 500_000, outputTokens: 0 });
    expect(result.input).toBeCloseTo(2);
    expect(result.cachedInput).toBeCloseTo(0.2);
    expect(result.total).toBeCloseTo(2.2);
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
