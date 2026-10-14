import { describe, expect, it } from "vitest";
import {
  evaluateChangeEffectiveness,
  type DailyOptimizationMetric,
  type OptimizationChangeWindow,
} from "@/lib/optimization/change-effectiveness";

const change: OptimizationChangeWindow = {
  changeId: "change_context_compaction",
  ruleId: "context-compaction",
  appliedAt: "2026-10-01T00:00:00.000Z",
  stoppedAt: null,
  collector: "claude",
  projectId: "project-a",
  source: "manual",
};

function metric(periodStart: string, knownCostUsd: number | null, overrides: Partial<DailyOptimizationMetric> = {}): DailyOptimizationMetric {
  return {
    periodStart,
    collector: "claude",
    projectId: "project-a",
    promptEquivalentCount: 40,
    llmCalls: 80,
    toolCalls: 20,
    toolErrorCount: 1,
    callsPastContextThreshold: 10,
    compactionCount: 2,
    compactionWaitMs: 2_000,
    knownCostUsd,
    costCoverage: knownCostUsd === null ? "none" : "complete",
    ...overrides,
  };
}

function stableMetrics(postDailyCost = 8): DailyOptimizationMetric[] {
  return [
    metric("2026-09-28T00:00:00.000Z", 10),
    metric("2026-09-29T00:00:00.000Z", 10),
    metric("2026-09-30T00:00:00.000Z", 10),
    metric("2026-10-01T00:00:00.000Z", postDailyCost, { llmCalls: 70, callsPastContextThreshold: 5 }),
    metric("2026-10-02T00:00:00.000Z", postDailyCost, { llmCalls: 70, callsPastContextThreshold: 5 }),
    metric("2026-10-03T00:00:00.000Z", postDailyCost, { llmCalls: 70, callsPastContextThreshold: 5 }),
  ];
}

describe("change effectiveness evaluator", () => {
  it("classifies a well-supported lower observed cost per prompt without claiming savings causality", () => {
    const report = evaluateChangeEffectiveness({ change, metrics: stableMetrics() });

    expect(report.classification).toBe("improved");
    expect(report.evidenceFloorMet).toBe(true);
    expect(report.pre.costPerPrompt).toBe(0.25);
    expect(report.post.costPerPrompt).toBe(0.2);
    expect(report.primaryOutcome.deltaPct).toBe(-20);
    expect(report.primaryOutcome.observedCostDifferenceAtPostVolumeUsd).toBe(-6);
    expect(report.claims).toEqual({
      causalSavingsClaimed: false,
      verifiedSavingsClaimed: false,
      realizedSavingsClaimed: false,
      eligibleForPairedExperimentVerification: true,
    });
  });

  it("fails closed when the post-change evidence floor is too small", () => {
    const report = evaluateChangeEffectiveness({
      change,
      metrics: [
        ...stableMetrics().slice(0, 3),
        metric("2026-10-01T00:00:00.000Z", 8, { promptEquivalentCount: 20 }),
        metric("2026-10-02T00:00:00.000Z", 8, { promptEquivalentCount: 20 }),
      ],
    });

    expect(report.classification).toBe("insufficient_evidence");
    expect(report.evidenceFloorMet).toBe(false);
    expect(report.warnings.join(" ")).toContain("at least 3 active days and 100 prompt-equivalent units");
  });

  it("requires complete known-cost coverage rather than treating missing cost as zero", () => {
    const metrics = stableMetrics();
    metrics[4] = metric("2026-10-02T00:00:00.000Z", 4, { costCoverage: "partial" });
    const report = evaluateChangeEffectiveness({ change, metrics });

    expect(report.classification).toBe("insufficient_evidence");
    expect(report.post.costCoverage).toBe("partial");
    expect(report.post.knownCostUsd).toBeNull();
    expect(report.primaryOutcome.post).toBeNull();
  });

  it("marks overlapping same-scope changes as confounded", () => {
    const report = evaluateChangeEffectiveness({
      change,
      metrics: stableMetrics(),
      otherChanges: [{
        changeId: "change_model_switch",
        ruleId: "model-switch",
        appliedAt: "2026-10-02T00:00:00.000Z",
        stoppedAt: null,
        collector: "claude",
        projectId: "project-a",
        source: "manual",
      }],
    });

    expect(report.evidenceFloorMet).toBe(true);
    expect(report.classification).toBe("confounded");
    expect(report.confounders).toContain("overlapping_changes:change_model_switch");
    expect(report.claims.eligibleForPairedExperimentVerification).toBe(false);
  });

  it("surfaces an unscoped project-mix shift instead of silently comparing unlike work", () => {
    const unscoped = { ...change, projectId: null };
    const metrics = stableMetrics().map((item) => ({ ...item, projectId: item.periodStart < "2026-10-01" ? "project-a" : "project-b" }));
    const report = evaluateChangeEffectiveness({ change: unscoped, metrics });

    expect(report.classification).toBe("confounded");
    expect(report.confounders).toContain("project_mix_shift");
  });

  it("uses the neutral band for small observed movement", () => {
    const report = evaluateChangeEffectiveness({ change, metrics: stableMetrics(9.9) });
    expect(report.primaryOutcome.deltaPct).toBe(-1);
    expect(report.classification).toBe("neutral");
  });
});
