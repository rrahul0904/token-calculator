import { describe, expect, it } from "vitest";
import { MODEL_CATALOG } from "@/lib/models";
import {
  DEFAULT_WORKLOAD_SCENARIO,
  compareWithPinned,
  computeCostQualityFrontier,
  deriveCacheBuckets,
  estimateWorkload,
  parseWorkloadQuery,
  serializeWorkloadQuery,
  solveTokensForBudget,
  splitTotalTokens,
} from "@/lib/economics/workload";

describe("workload economics", () => {
  const glm = MODEL_CATALOG.find((model) => model.id === "glm-5.3-flash")!;

  it("reconstructs the reference-style 1B token workload", () => {
    const scenario = parseWorkloadQuery("?model=glm-5.3-flash&mode=tokens2cost&tokens=1000000000&input=99&cache=98");
    const estimate = estimateWorkload(glm, scenario);
    expect(estimate.buckets.inputTokens).toBe(990_000_000);
    expect(estimate.buckets.outputTokens).toBe(10_000_000);
    expect(estimate.buckets.cachedReadTokens).toBe(970_200_000);
    expect(estimate.buckets.freshInputTokens).toBe(19_800_000);
    expect(estimate.cost.totalUsd).toBeCloseTo(18.538);
    expect(estimate.noCacheCostUsd).toBeCloseTo(76.75);
    expect(estimate.cacheSavingsPercent).toBeGreaterThan(75);
  });

  it("separates cacheability from hit rate", () => {
    const buckets = deriveCacheBuckets(100_000, 80, 50, 50);
    expect(buckets.inputTokens).toBe(80_000);
    expect(buckets.cacheableInputTokens).toBe(40_000);
    expect(buckets.cachedReadTokens).toBe(20_000);
    expect(buckets.freshInputTokens).toBe(60_000);
  });

  it("keeps output as the complement of input percentage", () => {
    expect(splitTotalTokens(1_000, 99)).toEqual({ inputTokens: 990, outputTokens: 10 });
  });

  it("round-trips only planning metadata in a stable query", () => {
    const original = { ...DEFAULT_WORKLOAD_SCENARIO, modelId: "glm-5.3-flash", pinnedModelId: "gpt-5.6-luna", endpointId: "openrouter:z-ai/glm-5.3-flash" };
    const encoded = serializeWorkloadQuery(original);
    expect(encoded).not.toContain("prompt");
    const decoded = parseWorkloadQuery(encoded);
    expect(decoded).toEqual(original);
    expect(serializeWorkloadQuery(decoded)).toBe(encoded);
  });

  it("solves cost-to-token budgets deterministically", () => {
    const target = { ...DEFAULT_WORKLOAD_SCENARIO, mode: "cost2tokens" as const, budgetUsd: 18.538 };
    const solved = solveTokensForBudget(glm, target)!;
    expect(solved.cost.totalUsd).not.toBeNull();
    expect(solved.cost.totalUsd!).toBeLessThanOrEqual(18.538);
    expect(solved.buckets.inputTokens + solved.buckets.outputTokens).toBeGreaterThan(999_000_000);
  });

  it("never implies pinned-model quality equivalence", () => {
    const luna = MODEL_CATALOG.find((model) => model.id === "gpt-5.6-luna")!;
    const comparison = compareWithPinned(glm, luna, DEFAULT_WORKLOAD_SCENARIO);
    expect(comparison.qualityEquivalent).toBe(false);
    expect(comparison.requestCostDeltaUsd).not.toBeNull();
  });

  it("builds a Pareto frontier only from evidence-backed quality scores", () => {
    const result = computeCostQualityFrontier([
      { id: "a", label: "A", costUsd: 1, qualityScore: 80, qualityEvidence: { source: "eval", sourceUrl: "https://example.com/a", benchmark: "x", observedAt: "2026-09-04" } },
      { id: "b", label: "B", costUsd: 2, qualityScore: 79, qualityEvidence: { source: "eval", sourceUrl: "https://example.com/b", benchmark: "x", observedAt: "2026-09-04" } },
      { id: "c", label: "C", costUsd: 3, qualityScore: null },
    ]);
    expect(result.frontier.map((item) => item.id)).toEqual(["a"]);
    expect(result.omittedWithoutEvidence).toEqual(["c"]);
  });
});
