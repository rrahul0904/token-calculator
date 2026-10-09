import { describe, expect, it } from "vitest";

import type { LinkedRunEconomics } from "@/lib/evaluations/run-economics";
import {
  compareStoredOutcomeQuality,
  optimizerPlanFromRunPairs,
  resolvePairedRunEvidence,
  routingEconomicsFromRunPairs,
  storedRunPair,
  storedRunToPortfolioReceipt,
  type PortfolioLinkedRunReceipt,
  type PortfolioRunPair,
  type StoredRunReceiptInput,
} from "@/lib/optimization/paired-run-evidence";
import { evaluateOptimizerPlan } from "@/lib/optimization/optimizer-plan";
import { evaluateRoutingEconomics } from "@/lib/optimization/routing-economics";

function run(
  runId: string,
  caseId: string,
  overrides: Partial<LinkedRunEconomics> = {},
): PortfolioLinkedRunReceipt {
  return {
    runId,
    caseId,
    terminal: true,
    economics: {
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
    },
  };
}

function storedRun(runId: string, overrides: Partial<StoredRunReceiptInput> = {}): StoredRunReceiptInput {
  return {
    id: runId,
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

function pair(index: number, overrides: Partial<PortfolioRunPair> = {}): PortfolioRunPair {
  const caseId = `case-${index}`;
  return {
    caseId,
    baseline: run(`baseline-${index}`, caseId),
    candidate: run(`candidate-${index}`, caseId, {
      reconciledCostUsd: "0.60",
      actualCostUsd: "0.60",
      freshInputTokens: 600,
      outputTokens: 300,
    }),
    qualityEquivalent: true,
    ...overrides,
  };
}

describe("paired optimizer run evidence", () => {
  it("uses authoritative linked-run economics and ignores caller-entered economics entirely", () => {
    const evidence = resolvePairedRunEvidence([pair(1), pair(2)]);

    expect(evidence.evidenceType).toBe("measured_before_after");
    expect(evidence.qualityGate).toBe("passed");
    expect(evidence.sampleSize).toBe(2);
    expect(evidence.baselineTokens).toBe(3_000);
    expect(evidence.candidateTokens).toBe(1_800);
    expect(evidence.baselineCostUsd).toBe(2);
    expect(evidence.candidateCostUsd).toBe(1.2);
    expect(evidence.blockers).toEqual([]);
    expect(evidence.evidenceSource).toContain("linked_runs:");
  });

  it("fails evidence closed when linked usage is not authoritative", () => {
    const badPair = pair(1, {
      candidate: run("candidate-1", "case-1", {
        usageSource: "estimated",
        reconciledCostUsd: "0.10",
        actualCostUsd: "0.10",
      }),
    });
    const evidence = resolvePairedRunEvidence([badPair]);

    expect(evidence.evidenceType).toBe("unknown");
    expect(evidence.candidateTokens).toBeNull();
    expect(evidence.blockers).toContain("candidate_usage_unverified");
    expect(evidence.evidenceSource).toBeNull();
  });

  it("rejects duplicate run IDs, duplicate cases and non-terminal runs", () => {
    const first = pair(1);
    const second = pair(1, {
      baseline: run("baseline-1", "case-1"),
      candidate: { ...run("candidate-2", "case-1"), terminal: false },
    });
    const evidence = resolvePairedRunEvidence([first, second]);

    expect(evidence.evidenceType).toBe("unknown");
    expect(evidence.blockers).toContain("duplicate_case_id");
    expect(evidence.blockers).toContain("duplicate_run_id");
    expect(evidence.blockers).toContain("non_terminal_run");
  });

  it("does not invent quality when the evaluation layer has not run", () => {
    const evidence = resolvePairedRunEvidence([pair(1, { qualityEquivalent: null })]);

    expect(evidence.evidenceType).toBe("measured_before_after");
    expect(evidence.qualityGate).toBe("not_run");
    expect(evidence.blockers).toContain("quality_not_run");
  });

  it("propagates a quality regression from the existing evaluation layer", () => {
    const evidence = resolvePairedRunEvidence([pair(1, { qualityEquivalent: false })]);

    expect(evidence.qualityGate).toBe("failed");
    expect(evidence.blockers).toContain("quality_regression");
  });

  it("adapts stored run receipts without caller-supplied economics", () => {
    const receipt = storedRunToPortfolioReceipt(storedRun("run-1", {
      reconciledCostUsd: "0.75",
      freshInputTokens: 700,
      outputTokens: 200,
      retryCount: 1,
    }), "case-stored");

    expect(receipt.runId).toBe("run-1");
    expect(receipt.caseId).toBe("case-stored");
    expect(receipt.terminal).toBe(true);
    expect(receipt.economics.reconciledCostUsd).toBe("0.75");
    expect(receipt.economics.freshInputTokens).toBe(700);
    expect(receipt.economics.retryCount).toBe(1);
  });

  it("derives stored quality with the existing 0.02 non-inferiority margin and boolean non-regression", () => {
    expect(compareStoredOutcomeQuality({
      baseline: { score: "0.90", taskCompleted: true, testsPassed: true },
      candidate: { score: "0.89", taskCompleted: true, testsPassed: true },
    })).toBe(true);

    expect(compareStoredOutcomeQuality({
      baseline: { score: "0.90", taskCompleted: true, testsPassed: true },
      candidate: { score: "0.87", taskCompleted: true, testsPassed: true },
    })).toBe(false);

    expect(compareStoredOutcomeQuality({
      baseline: { score: "0.90", taskCompleted: true, testsPassed: true },
      candidate: { score: "0.90", taskCompleted: true, testsPassed: false },
    })).toBe(false);

    expect(compareStoredOutcomeQuality({ baseline: {}, candidate: {} })).toBeNull();
  });

  it("builds a pair directly from stored run and outcome receipts", () => {
    const storedPair = storedRunPair({
      caseId: "case-stored",
      baselineRun: storedRun("baseline-stored"),
      candidateRun: storedRun("candidate-stored", {
        reconciledCostUsd: "0.60",
        actualCostUsd: "0.60",
        freshInputTokens: 600,
        outputTokens: 300,
      }),
      baselineOutcome: { score: "0.90", taskCompleted: true, testsPassed: true },
      candidateOutcome: { score: "0.90", taskCompleted: true, testsPassed: true },
    });

    const evidence = resolvePairedRunEvidence([storedPair]);
    expect(evidence.evidenceType).toBe("measured_before_after");
    expect(evidence.qualityGate).toBe("passed");
    expect(evidence.baselineTokens).toBe(1_500);
    expect(evidence.candidateTokens).toBe(900);
  });

  it("builds a measured optimizer-plan candidate from five authoritative paired cases", () => {
    const pairs = [1, 2, 3, 4, 5].map((index) => pair(index));
    const candidate = optimizerPlanFromRunPairs({
      id: "receipt-backed-plan",
      components: [{
        id: "output-reducer",
        familyKey: "tool-output-reduction",
        claimClass: "token_reduction_candidate",
        individualClaimable: true,
        individualSavingsPct: 30,
      }],
      pairs,
    });
    const result = evaluateOptimizerPlan(candidate);

    expect(candidate.evidenceType).toBe("measured_before_after");
    expect(candidate.sampleSize).toBe(5);
    expect(candidate.baselineSessionTokens).toBe(7_500);
    expect(candidate.candidateSessionTokens).toBe(4_500);
    expect(result.status).toBe("verified_plan_savings");
    expect(result.measuredPlanSavingsPct).toBe(40);
  });

  it("builds cost-only routing evidence without turning lower cost into token savings", () => {
    const pairs = [1, 2, 3, 4, 5].map((index) => pair(index));
    const candidate = routingEconomicsFromRunPairs({
      id: "receipt-backed-routing",
      pairs,
      routeProvenanceGate: "verified",
      baselineRoute: "premium/model",
      resolvedRoutes: ["economy/model"],
      requiredExactRoute: true,
    });
    const result = evaluateRoutingEconomics(candidate);

    expect(result.status).toBe("verified_cost_savings");
    expect(result.measuredCostSavingsPct).toBe(40);
    expect(result.costSavingsClaimable).toBe(true);
    expect(result.tokenSavingsClaimable).toBe(false);
  });
});
