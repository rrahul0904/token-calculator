import { describe, expect, it } from "vitest";
import { selectRunCost, summarizeOutcomeEconomics, type OutcomeEconomicsInput } from "@/lib/outcomes/economics";

function row(overrides: Partial<OutcomeEconomicsInput> = {}): OutcomeEconomicsInput {
  return {
    runId: "run_12345678",
    repo: "rrahul0904/token-calculator",
    agentName: "Codex",
    reconciledCostUsd: null,
    actualCostUsd: 2,
    estimatedCostUsd: 3,
    outcome: {
      taskCompleted: true,
      testsPassed: true,
      prNumber: 42,
      ciPassed: true,
      merged: true,
      deploymentSuccessful: false,
      associationConfidence: 0.95,
    },
    ...overrides,
  };
}

describe("outcome economics", () => {
  it("prefers reconciled then actual then estimated cost evidence", () => {
    expect(selectRunCost(row({ reconciledCostUsd: 1.5 }))).toEqual({ value: 1.5, evidence: "reconciled" });
    expect(selectRunCost(row())).toEqual({ value: 2, evidence: "actual" });
    expect(selectRunCost(row({ actualCostUsd: null }))).toEqual({ value: 3, evidence: "estimated" });
    expect(selectRunCost(row({ actualCostUsd: null, estimatedCostUsd: null }))).toEqual({ value: null, evidence: "unknown" });
  });

  it("uses only high-confidence attribution for outcome unit economics", () => {
    const result = summarizeOutcomeEconomics([
      row({ runId: "run_a", actualCostUsd: 2 }),
      row({ runId: "run_b", actualCostUsd: 1, outcome: { ...row().outcome!, prNumber: 42 } }),
      row({ runId: "run_c", actualCostUsd: 9, outcome: { ...row().outcome!, prNumber: 99, associationConfidence: 0.4 } }),
    ]);

    expect(result.attributedRuns).toBe(3);
    expect(result.highConfidenceRuns).toBe(2);
    expect(result.mergedPullRequests).toBe(1);
    expect(result.knownCostPerMergedPrUsd).toBe(3);
  });

  it("keeps estimated spend separate from observed or reconciled unit economics", () => {
    const result = summarizeOutcomeEconomics([
      row({ runId: "run_actual", actualCostUsd: 2, estimatedCostUsd: 4 }),
      row({ runId: "run_estimated", actualCostUsd: null, estimatedCostUsd: 5, outcome: { ...row().outcome!, prNumber: 43 } }),
      row({ runId: "run_unknown", actualCostUsd: null, estimatedCostUsd: null, outcome: { ...row().outcome!, merged: false, prNumber: null } }),
    ]);

    expect(result.knownAttributedCostUsd).toBe(2);
    expect(result.estimatedAttributedCostUsd).toBe(5);
    expect(result.knownCostRuns).toBe(1);
    expect(result.estimatedOnlyRuns).toBe(1);
    expect(result.unknownCostRuns).toBe(1);
    expect(result.knownCostPerMergedPrUsd).toBe(1);
  });

  it("reports deployment-linked cost without claiming unique deployment counts", () => {
    const result = summarizeOutcomeEconomics([
      row({ runId: "run_deploy_1", actualCostUsd: 2, outcome: { ...row().outcome!, deploymentSuccessful: true } }),
      row({ runId: "run_deploy_2", actualCostUsd: 4, outcome: { ...row().outcome!, deploymentSuccessful: true, prNumber: 44 } }),
    ]);

    expect(result.deploymentLinkedRuns).toBe(2);
    expect(result.knownCostPerDeploymentLinkedRunUsd).toBe(3);
  });
});
