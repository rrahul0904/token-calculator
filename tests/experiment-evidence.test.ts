import { describe, expect, it } from "vitest";
import { evaluateExperimentRows, experimentEvidence, type ExperimentEvidenceRow } from "@/lib/evaluations/experiment-evidence";

const baseline = { count: 5, successRate: 1, medianQuality: 0.95, medianCostUsd: 1 };
const candidate = { count: 5, successRate: 1, medianQuality: 0.94, medianCostUsd: 0.6 };

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
      target_tool: "repo_search",
      target_tool_call_count: 2,
      index_time_ms: 20,
    },
    ...overrides,
  };
}

function pairedRows() {
  return Array.from({ length: 5 }, (_, index) => index).flatMap((index) => [row("baseline", index), row("candidate", index)]);
}

describe("experiment evidence labels", () => {
  it("does not promote recorded results to verified evidence", () => {
    expect(experimentEvidence({ status: "completed", resultCount: 1, baseline: { ...baseline, count: 1 }, candidate: { ...candidate, count: 0 }, minimumQualityScore: null })).toBe("results_recorded");
  });

  it("requires paired full-session economics, complete cache and tool accounting, and quality preservation", () => {
    const rows = pairedRows();
    const result = evaluateExperimentRows({ status: "completed", rows, minimumQualityScore: null });
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
      indexTimeReportedCount: 10,
      indexTimeCoverage: 1,
    });
    expect(experimentEvidence({ status: "completed", resultCount: rows.length, rows, minimumQualityScore: null })).toBe("experiment_verified");
  });

  it("does not verify submitted/manual economics", () => {
    const rows = pairedRows().map((item) => ({
      ...item,
      economicsSource: "submitted",
      measurementScope: "submitted_observation",
      benchmarkContext: {},
    }));
    const result = evaluateExperimentRows({ status: "completed", rows, minimumQualityScore: null });
    expect(result.passed).toBe(false);
    expect(result.prerequisites.fullSessionEconomics).toBe(false);
    expect(result.evidenceType).toBe("insufficient_evidence");
  });

  it("requires every row to carry cost, quality and success evidence", () => {
    const rows = pairedRows();
    rows[0] = { ...rows[0], costUsd: null };
    const result = evaluateExperimentRows({ status: "completed", rows, minimumQualityScore: null });
    expect(result.passed).toBe(false);
    expect(result.prerequisites.fullSessionEconomics).toBe(false);
  });

  it("rejects unpaired and duplicate cases instead of counting them as independent evidence", () => {
    const rows = pairedRows();
    rows[9] = row("candidate", 3, { runId: "run_duplicate" });
    const result = evaluateExperimentRows({ status: "completed", rows, minimumQualityScore: null });
    expect(result.passed).toBe(false);
    expect(result.benchmarkIntegrity?.sameCaseCohort).toBe(false);
    expect(result.benchmarkIntegrity?.noDuplicateCases).toBe(false);
  });

  it("keeps index timing as disclosed coverage, not a universal gate", () => {
    const rows = pairedRows().map((item) => ({
      ...item,
      benchmarkContext: { ...item.benchmarkContext, index_time_ms: null },
    }));
    const result = evaluateExperimentRows({ status: "completed", rows, minimumQualityScore: null });
    expect(result.passed).toBe(true);
    expect(result.benchmarkIntegrity?.indexTimeCoverage).toBe(0);
  });

  it("keeps a cheaper but lower-quality candidate unverified", () => {
    expect(experimentEvidence({ status: "completed", resultCount: 10, baseline, candidate: { ...candidate, medianQuality: 0.7 }, minimumQualityScore: null })).toBe("results_recorded");
  });
});
