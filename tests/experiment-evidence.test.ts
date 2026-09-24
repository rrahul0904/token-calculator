import { describe, expect, it } from "vitest";
import { evaluateExperimentRows, experimentEvidence, type ExperimentEvidenceRow } from "@/lib/evaluations/experiment-evidence";

function row(variant: "baseline" | "candidate", index: number, overrides: Partial<ExperimentEvidenceRow> = {}): ExperimentEvidenceRow {
  return {
    variant,
    caseId: `case_${index}`,
    runId: `run_${variant}_${index}`,
    qualityScore: variant === "baseline" ? 0.95 : 0.94,
    costUsd: variant === "baseline" ? 1 : 0.6,
    success: true,
    economicsSource: "linked_run",
    measurementScope: "full_session",
    benchmarkContext: {
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      tool_call_count: 4,
      target_tool_call_count: 2,
      index_time_ms: 20,
    },
    ...overrides,
  };
}

function pairedRows() {
  return Array.from({ length: 5 }, (_, index) => index + 1).flatMap((index) => [
    row("baseline", index),
    row("candidate", index),
  ]);
}

describe("experiment evidence labels", () => {
  it("does not promote recorded results to verified evidence without row-level benchmark integrity", () => {
    expect(experimentEvidence({
      status: "completed",
      resultCount: 10,
      baseline: { count: 5, successRate: 1, medianQuality: 0.95, medianCostUsd: 1 },
      candidate: { count: 5, successRate: 1, medianQuality: 0.94, medianCostUsd: 0.6 },
      minimumQualityScore: null,
    })).toBe("results_recorded");
  });

  it("verifies a cheaper candidate only when the same cases use authoritative full-session evidence", () => {
    const result = evaluateExperimentRows({
      status: "completed",
      rows: pairedRows(),
      minimumQualityScore: null,
    });

    expect(result.passed).toBe(true);
    expect(result.evidenceType).toBe("experiment_verified");
    expect(result.benchmarkIntegrity).toMatchObject({
      pairedCaseCount: 5,
      sameCaseCohort: true,
      authoritativeFullSessionCount: 10,
      authoritativeFullSessionEconomics: true,
      cacheAccountingComplete: true,
      toolCallAccountingComplete: true,
      targetToolAccountingCount: 10,
      targetToolInvocationRate: 1,
    });
  });

  it("rejects caller-submitted economics even when the headline cost and quality numbers look good", () => {
    const rows = pairedRows().map((item) => ({
      ...item,
      economicsSource: "submitted",
      measurementScope: "submitted_observation",
      benchmarkContext: {},
    }));
    const result = evaluateExperimentRows({ status: "completed", rows, minimumQualityScore: null });

    expect(result.passed).toBe(false);
    expect(result.evidenceType).toBe("insufficient_evidence");
    expect(result.prerequisites.fullSessionEconomics).toBe(false);
    expect(result.prerequisites.cacheAccounting).toBe(false);
    expect(result.prerequisites.toolCallAccounting).toBe(false);
  });

  it("rejects unpaired cohorts and duplicate case rows instead of treating them as independent samples", () => {
    const rows = pairedRows();
    rows[9] = row("candidate", 4, { runId: "run_candidate_duplicate" });
    const result = evaluateExperimentRows({ status: "completed", rows, minimumQualityScore: null });

    expect(result.passed).toBe(false);
    expect(result.benchmarkIntegrity?.sameCaseCohort).toBe(false);
    expect(result.benchmarkIntegrity?.noDuplicateCases).toBe(false);
    expect(result.prerequisites.pairedCaseCohort).toBe(false);
  });

  it("keeps a cheaper but lower-quality full-session candidate unverified", () => {
    const rows = pairedRows().map((item) => item.variant === "candidate" ? { ...item, qualityScore: 0.7 } : item);
    const result = evaluateExperimentRows({ status: "completed", rows, minimumQualityScore: null });

    expect(result.passed).toBe(false);
    expect(result.evidenceType).toBe("experiment_rejected");
  });
});
