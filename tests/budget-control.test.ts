import { describe, expect, it } from "vitest";

import { evaluateBudgetControl } from "@/lib/optimization/budget-control";

describe("budget control evidence", () => {
  it("verifies measured cost savings only with authoritative enforcement", () => {
    const result = evaluateBudgetControl({
      id: "hard-budget",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      enforcementGate: "verified",
      sampleSize: 10,
      budgetLimitUsd: 8,
      baselineCostUsd: 12,
      candidateCostUsd: 6,
      controlPlaneOverheadCostUsd: 1,
      baselineSessionTokens: 10_000,
      candidateSessionTokens: 12_000,
    });

    expect(result.status).toBe("verified_cost_savings");
    expect(result.withinBudget).toBe(true);
    expect(result.costSavingsClaimable).toBe(true);
    expect(result.tokenSavingsClaimable).toBe(false);
    expect(result.observedTokenDelta).toBe(2_000);
  });

  it("fails closed on a policy bypass", () => {
    const result = evaluateBudgetControl({
      id: "bypass",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      enforcementGate: "verified",
      sampleSize: 10,
      budgetLimitUsd: 8,
      baselineCostUsd: 12,
      candidateCostUsd: 5,
      policyBypasses: 1,
    });

    expect(result.status).toBe("policy_bypass");
    expect(result.costSavingsClaimable).toBe(false);
  });

  it("blocks candidates that exceed the hard budget after overhead", () => {
    const result = evaluateBudgetControl({
      id: "over-budget",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      enforcementGate: "verified",
      sampleSize: 10,
      budgetLimitUsd: 5,
      baselineCostUsd: 12,
      candidateCostUsd: 5,
      controlPlaneOverheadCostUsd: 1,
    });

    expect(result.netCandidateCostUsd).toBe(6);
    expect(result.status).toBe("budget_breach");
  });

  it("does not count denied required work as optimization", () => {
    const result = evaluateBudgetControl({
      id: "denied-work",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      enforcementGate: "verified",
      sampleSize: 10,
      budgetLimitUsd: 8,
      baselineCostUsd: 12,
      candidateCostUsd: 1,
      requiredWorkDenied: 2,
    });

    expect(result.status).toBe("required_work_denied");
  });
});
