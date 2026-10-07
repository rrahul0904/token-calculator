import { describe, expect, it } from "vitest";

import { adaptPortfolioPairsToExperimentEvidence } from "@/lib/optimization/experiment-result-adapter";
import type { StoredRunReceiptInput } from "@/lib/optimization/paired-run-evidence";

function run(id: string, overrides: Partial<StoredRunReceiptInput> = {}): StoredRunReceiptInput {
  return {
    id,
    endedAt: new Date("2026-10-06T00:00:00Z"),
    reconciledCostUsd: "1.00",
    actualCostUsd: "1.00",
    usageSource: "provider_measured",
    agentVendor: "openai",
    freshInputTokens: 1_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    outputTokens: 500,
    retryCount: 0,
    fallbackCount: 0,
    ...overrides,
  };
}

function pair(index: number) {
  return {
    caseId: `case-${index}`,
    baselineRun: run(`baseline-${index}`),
    candidateRun: run(`candidate-${index}`, {
      reconciledCostUsd: "0.60",
      actualCostUsd: "0.60",
      freshInputTokens: 600,
      outputTokens: 300,
    }),
    baselineOutcome: { score: "0.90", taskCompleted: true, testsPassed: true },
    candidateOutcome: { score: "0.90", taskCompleted: true, testsPassed: true },
  };
}

describe("portfolio experiment result adapter", () => {
  it("produces rows compatible with the existing experiment evidence gate", () => {
    const result = adaptPortfolioPairsToExperimentEvidence({
      pairs: [1, 2, 3, 4, 5].map(pair),
      experimentStatus: "completed",
      minimumQualityScore: 0.8,
      maxCostRegressionPct: 0,
    });

    expect(result.eligibleForVerification).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.rows).toHaveLength(10);
    expect(result.rows.filter((row) => row.variant === "baseline")).toHaveLength(5);
    expect(result.rows.filter((row) => row.variant === "candidate")).toHaveLength(5);
    expect(result.rows.every((row) => row.economicsSource === "linked_run")).toBe(true);
    expect(result.verification?.passed).toBe(true);
    expect(result.verification?.evidenceType).toBe("experiment_verified");
  });

  it("refuses verification when any run lacks authoritative measured economics", () => {
    const pairs = [1, 2, 3, 4, 5].map(pair);
    pairs[4].candidateRun = run("candidate-5", {
      usageSource: "estimated",
      reconciledCostUsd: "0.10",
      actualCostUsd: "0.10",
    });

    const result = adaptPortfolioPairsToExperimentEvidence({ pairs });
    expect(result.eligibleForVerification).toBe(false);
    expect(result.blockers).toContain("authoritative_tokens_required");
    expect(result.blockers).toContain("authoritative_cost_required");
    expect(result.verification).toBeNull();
  });

  it("refuses verification when stored outcome evidence is incomplete", () => {
    const pairs = [1, 2, 3, 4, 5].map(pair);
    pairs[0].candidateOutcome = { score: null, taskCompleted: null, testsPassed: null };

    const result = adaptPortfolioPairsToExperimentEvidence({ pairs });
    expect(result.eligibleForVerification).toBe(false);
    expect(result.blockers).toContain("quality_score_required");
    expect(result.blockers).toContain("success_evidence_required");
  });

  it("refuses duplicate case/run identity and non-terminal evidence", () => {
    const pairs = [1, 2, 3, 4, 5].map(pair);
    pairs[1].caseId = "case-1";
    pairs[1].baselineRun = run("baseline-1", { endedAt: null });

    const result = adaptPortfolioPairsToExperimentEvidence({ pairs });
    expect(result.eligibleForVerification).toBe(false);
    expect(result.blockers).toContain("duplicate_case_id");
    expect(result.blockers).toContain("duplicate_run_id");
    expect(result.blockers).toContain("non_terminal_run");
  });

  it("lets the existing experiment gate reject quality regressions rather than inventing a portfolio gate", () => {
    const pairs = [1, 2, 3, 4, 5].map(pair);
    for (const item of pairs) item.candidateOutcome.score = "0.50";

    const result = adaptPortfolioPairsToExperimentEvidence({
      pairs,
      minimumQualityScore: 0.8,
    });

    expect(result.eligibleForVerification).toBe(true);
    expect(result.verification?.passed).toBe(false);
    expect(result.verification?.evidenceType).toBe("experiment_rejected");
  });
});
