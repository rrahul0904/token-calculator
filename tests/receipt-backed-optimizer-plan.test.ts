import { describe, expect, it } from "vitest";

import { analyzeReceiptBackedOptimizerPlan } from "@/lib/optimization/receipt-backed-optimizer-plan";
import type { StoredRunReceiptInput } from "@/lib/optimization/paired-run-evidence";

function run(id: string, tokens: number, costUsd: number): StoredRunReceiptInput {
  return {
    id,
    endedAt: "2026-10-08T12:00:00.000Z",
    reconciledCostUsd: costUsd.toFixed(4),
    actualCostUsd: costUsd.toFixed(4),
    usageSource: "reconciled",
    agentVendor: "openai",
    freshInputTokens: tokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    outputTokens: 0,
    retryCount: 0,
    fallbackCount: 0,
  };
}

const components = [
  {
    id: "output-reducer",
    familyKey: "tool-output-reduction",
    claimClass: "token_reduction_candidate" as const,
    individualClaimable: true,
    individualSavingsPct: 50,
  },
  {
    id: "context-compressor",
    familyKey: "prompt-compression",
    claimClass: "token_reduction_candidate" as const,
    individualClaimable: true,
    individualSavingsPct: 30,
  },
];

describe("receipt-backed optimizer plan analysis", () => {
  it("derives a combined-plan claim from stored receipts instead of summing component claims", () => {
    const pairs = Array.from({ length: 5 }, (_, index) => ({
      caseId: `case-${index + 1}`,
      baselineRun: run(`baseline-${index + 1}`, 1_000, 1),
      candidateRun: run(`candidate-${index + 1}`, 600, 0.6),
      baselineOutcome: { score: 0.9, taskCompleted: true, testsPassed: true },
      candidateOutcome: { score: 0.9, taskCompleted: true, testsPassed: true },
    }));

    const result = analyzeReceiptBackedOptimizerPlan({
      id: "combined-plan",
      components,
      pairs,
      minimumSampleSize: 5,
    });

    expect(result.plan.status).toBe("verified_plan_savings");
    expect(result.plan.measuredPlanSavingsPct).toBe(40);
    expect(result.plan.summedComponentSavingsPct).toBeNull();
    expect(result.plan.componentSavingsSummed).toBe(false);
    expect(result.evidence.baselineTokens).toBe(5_000);
    expect(result.evidence.candidateTokens).toBe(3_000);
    expect(result.experimentEvidence.eligibleForVerification).toBe(true);
    expect(result.trustBoundary.callerSuppliedEconomicsAccepted).toBe(false);
    expect(result.trustBoundary.callerSuppliedQualityAccepted).toBe(false);
  });

  it("fails closed when stored outcome evidence regresses", () => {
    const result = analyzeReceiptBackedOptimizerPlan({
      id: "quality-regression",
      components,
      pairs: [{
        caseId: "case-1",
        baselineRun: run("baseline-1", 1_000, 1),
        candidateRun: run("candidate-1", 500, 0.5),
        baselineOutcome: { score: 0.95, taskCompleted: true, testsPassed: true },
        candidateOutcome: { score: 0.5, taskCompleted: true, testsPassed: false },
      }],
      minimumSampleSize: 1,
    });

    expect(result.plan.status).toBe("quality_regression");
    expect(result.plan.tokenSavingsClaimable).toBe(false);
    expect(result.evidence.blockers).toContain("quality_regression");
  });
});
