import { describe, expect, it } from "vitest";

import { evaluateOptimizerPlan } from "@/lib/optimization/optimizer-plan";

describe("optimizer plan evidence", () => {
  const components = [
    {
      id: "output-reducer",
      familyKey: "tool-output-reduction",
      claimClass: "token_reduction_candidate" as const,
      individualClaimable: true,
      individualSavingsPct: 40,
    },
    {
      id: "context-compressor",
      familyKey: "prompt-compression",
      claimClass: "token_reduction_candidate" as const,
      individualClaimable: true,
      individualSavingsPct: 30,
    },
  ];

  it("never sums individual component percentages", () => {
    const result = evaluateOptimizerPlan({
      id: "unmeasured-combination",
      components,
      evidenceType: "unknown",
      qualityGate: "not_run",
      sampleSize: 0,
      baselineSessionTokens: null,
      candidateSessionTokens: null,
    });

    expect(result.componentSavingsSummed).toBe(false);
    expect(result.summedComponentSavingsPct).toBeNull();
    expect(result.status).toBe("plan_evidence_required");
    expect(result.tokenSavingsClaimable).toBe(false);
  });

  it("tracks overlapping capability families without pretending they are additive", () => {
    const result = evaluateOptimizerPlan({
      id: "overlap",
      components: [
        ...components,
        {
          id: "second-compressor",
          familyKey: "prompt-compression",
          claimClass: "token_reduction_candidate",
          individualClaimable: true,
          individualSavingsPct: 20,
        },
      ],
      evidenceType: "unknown",
      qualityGate: "not_run",
      sampleSize: 0,
      baselineSessionTokens: null,
      candidateSessionTokens: null,
    });

    expect(result.overlappingFamilyKeys).toEqual(["prompt-compression"]);
    expect(result.summedComponentSavingsPct).toBeNull();
  });

  it("allows cost-only components in a plan but still requires plan-level token evidence", () => {
    const result = evaluateOptimizerPlan({
      id: "with-routing",
      components: [
        ...components,
        {
          id: "route-policy",
          familyKey: "model-routing",
          claimClass: "cost_reduction_only",
          individualClaimable: true,
          individualSavingsPct: 50,
        },
      ],
      evidenceType: "modeled_estimate",
      qualityGate: "passed",
      sampleSize: 20,
      baselineSessionTokens: 40_000,
      candidateSessionTokens: 20_000,
      baselineCostUsd: 10,
      candidateCostUsd: 4,
    });

    expect(result.status).toBe("candidate");
    expect(result.measuredPlanSavingsPct).toBe(50);
    expect(result.measuredPlanCostSavingsPct).toBe(60);
    expect(result.tokenSavingsClaimable).toBe(false);
  });

  it("detects a combined-plan token regression even when every component was individually claimable", () => {
    const result = evaluateOptimizerPlan({
      id: "interaction-regression",
      components,
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      sampleSize: 10,
      baselineSessionTokens: 20_000,
      candidateSessionTokens: 22_000,
    });

    expect(result.allComponentsIndividuallyClaimable).toBe(true);
    expect(result.status).toBe("token_regression");
    expect(result.tokenSavingsClaimable).toBe(false);
  });

  it("verifies only measured same-cohort plan-level savings with equivalent quality", () => {
    const result = evaluateOptimizerPlan({
      id: "verified-plan",
      components,
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      sampleSize: 12,
      baselineSessionTokens: 50_000,
      candidateSessionTokens: 30_000,
      baselineCostUsd: 8,
      candidateCostUsd: 5,
      evidenceSource: "paired-plan-run-receipts",
    });

    expect(result.measuredPlanSavingsTokens).toBe(20_000);
    expect(result.measuredPlanSavingsPct).toBe(40);
    expect(result.measuredPlanCostSavingsUsd).toBe(3);
    expect(result.measuredPlanCostSavingsPct).toBe(37.5);
    expect(result.status).toBe("verified_plan_savings");
    expect(result.tokenSavingsClaimable).toBe(true);
    expect(result.componentSavingsSummed).toBe(false);
  });
});
