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
  const luna = MODEL_CATALOG.find((model) => model.id === "gpt-5.6-luna")!;

  it("reconstructs a 1B token workload with current effective pricing", () => {
    const scenario = parseWorkloadQuery(
      "?model=gpt-5.6-luna&mode=tokens2cost&tokens=1000000000&input=99&cache=98",
    );
    const estimate = estimateWorkload(luna, scenario);
    expect(estimate.buckets.inputTokens).toBe(990_000_000);
    expect(estimate.buckets.outputTokens).toBe(10_000_000);
    expect(estimate.buckets.cachedReadTokens).toBe(970_200_000);
    expect(estimate.buckets.freshInputTokens).toBe(19_800_000);
    expect(estimate.cost.totalUsd).toBeCloseTo(64.728);
    expect(estimate.noCacheCostUsd).toBeCloseTo(414);
    expect(estimate.cacheSavingsPercent).toBeGreaterThan(80);
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
    const original = {
      ...DEFAULT_WORKLOAD_SCENARIO,
      modelId: "gpt-5.6-luna",
      pinnedModelId: "gpt-5.6-sol",
      endpointId: "direct:openai:gpt-5.6-luna",
    };
    const encoded = serializeWorkloadQuery(original);
    expect(encoded).not.toContain("prompt");
    const decoded = parseWorkloadQuery(encoded);
    expect(decoded).toEqual(original);
    expect(serializeWorkloadQuery(decoded)).toBe(encoded);
  });

  it("solves cost-to-token budgets deterministically", () => {
    const target = {
      ...DEFAULT_WORKLOAD_SCENARIO,
      mode: "cost2tokens" as const,
      budgetUsd: 64.728,
    };
    const solved = solveTokensForBudget(luna, target)!;
    const solvedTokens = solved.buckets.inputTokens + solved.buckets.outputTokens;
    expect(solved.cost.totalUsd).not.toBeNull();
    expect(solved.cost.totalUsd!).toBeLessThanOrEqual(target.budgetUsd);
    expect(solvedTokens).toBeGreaterThan(999_000_000);
    const next = estimateWorkload(luna, {
      ...target,
      mode: "tokens2cost",
      totalTokens: solvedTokens + 1,
    });
    expect(next.cost.totalUsd!).toBeGreaterThan(target.budgetUsd);
  });

  it("solves across a long-context pricing discontinuity without using a naive linear inverse", () => {
    const target = {
      ...DEFAULT_WORKLOAD_SCENARIO,
      modelId: luna.id,
      mode: "cost2tokens" as const,
      budgetUsd: 0.08,
      inputPercent: 100,
      cacheHitPercent: 0,
      cacheableInputPercent: 0,
    };
    const solved = solveTokensForBudget(luna, target)!;
    const solvedTokens = solved.buckets.inputTokens + solved.buckets.outputTokens;
    expect(solvedTokens).toBe(272_000);
    expect(solved.cost.totalUsd!).toBeLessThanOrEqual(target.budgetUsd);
    expect(
      estimateWorkload(luna, {
        ...target,
        mode: "tokens2cost",
        totalTokens: solvedTokens + 1,
      }).cost.totalUsd!,
    ).toBeGreaterThan(target.budgetUsd);
  });

  it("propagates unknown cache-read and cache-write pricing instead of treating it as zero", () => {
    const pro = MODEL_CATALOG.find((model) => model.id === "gpt-5.5-pro")!;
    const cacheReadUnknown = estimateWorkload(pro, {
      ...DEFAULT_WORKLOAD_SCENARIO,
      modelId: pro.id,
      totalTokens: 1_000_000,
      inputPercent: 100,
      cacheHitPercent: 50,
      cacheableInputPercent: 100,
    });
    expect(cacheReadUnknown.cost.cachedReadUsd).toBeNull();
    expect(cacheReadUnknown.cost.totalUsd).toBeNull();

    const writeUnknown = estimateWorkload(luna, {
      ...DEFAULT_WORKLOAD_SCENARIO,
      totalTokens: 1_000_000,
      inputPercent: 100,
      cacheHitPercent: 0,
      cacheableInputPercent: 100,
      cacheWrite5mPercent: 100,
    });
    expect(writeUnknown.cost.cacheWrite5mUsd).toBeNull();
    expect(writeUnknown.cost.totalUsd).toBeNull();
  });

  it("normalizes malformed deep-link state and rejects model/endpoint mismatches", () => {
    const parsed = parseWorkloadQuery(
      "?model=not-real&endpoint=direct:openai:gpt-5.6-sol&pin=also-not-real&tokens=-4&input=140&cache=-2&budget=999999999999&requests=999999999999999",
    );
    expect(parsed.modelId).toBe(DEFAULT_WORKLOAD_SCENARIO.modelId);
    expect(parsed.endpointId).toBeNull();
    expect(parsed.pinnedModelId).toBeNull();
    expect(parsed.totalTokens).toBe(0);
    expect(parsed.inputPercent).toBe(100);
    expect(parsed.cacheHitPercent).toBe(0);
    expect(parsed.budgetUsd).toBe(1_000_000_000);
    expect(parsed.requestsPerMonth).toBe(1_000_000_000_000);
  });

  it("handles zero and maximum planning scale safely", () => {
    const zero = estimateWorkload(luna, { ...DEFAULT_WORKLOAD_SCENARIO, totalTokens: 0 });
    expect(zero.cost.totalUsd).toBe(0);
    const huge = parseWorkloadQuery("?tokens=999999999999999999999&input=100");
    expect(huge.totalTokens).toBe(1_000_000_000_000_000);
    const estimate = estimateWorkload(luna, huge);
    expect(Number.isFinite(estimate.cost.totalUsd!)).toBe(true);
  });

  it("never implies pinned-model quality equivalence", () => {
    const sonnet = MODEL_CATALOG.find((model) => model.id === "claude-sonnet-5")!;
    const comparison = compareWithPinned(luna, sonnet, DEFAULT_WORKLOAD_SCENARIO);
    expect(comparison.qualityEquivalent).toBe(false);
    expect(comparison.requestCostDeltaUsd).not.toBeNull();
  });

  it("builds a Pareto frontier only from evidence-backed quality scores", () => {
    const result = computeCostQualityFrontier([
      {
        id: "a",
        label: "A",
        costUsd: 1,
        qualityScore: 80,
        qualityEvidence: {
          source: "eval",
          sourceUrl: "https://example.com/a",
          benchmark: "x",
          observedAt: "2026-09-04",
        },
      },
      {
        id: "b",
        label: "B",
        costUsd: 2,
        qualityScore: 79,
        qualityEvidence: {
          source: "eval",
          sourceUrl: "https://example.com/b",
          benchmark: "x",
          observedAt: "2026-09-04",
        },
      },
      { id: "c", label: "C", costUsd: 3, qualityScore: null },
    ]);
    expect(result.frontier.map((item) => item.id)).toEqual(["a"]);
    expect(result.omittedWithoutEvidence).toEqual(["c"]);
  });
});
