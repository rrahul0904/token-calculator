import { describe, expect, it } from "vitest";
import { evaluateRegressionGate, evaluateSuite } from "@/lib/evaluations/engine";
import { evaluateExperimentRows } from "@/lib/evaluations/experiment-evidence";

describe("deterministic evaluations", () => {
  it("evaluates quality without an LLM judge", () => {
    const result = evaluateSuite([
      { id: "schema", kind: "json_schema", requiredKeys: ["answer"] },
      { id: "tests", kind: "tests_passed", required: true },
      { id: "tool", kind: "expected_tool", tool: "git" },
      { id: "artifact", kind: "required_artifact", artifactType: "pull_request" },
      { id: "ci", kind: "ci_result", required: true },
      { id: "custom", kind: "custom_numeric", key: "coverage", operator: ">=", threshold: 0.9 },
    ], {
      outputJson: { answer: "ok" },
      testsPassed: true,
      toolsInvoked: ["git"],
      artifacts: [{ type: "pull_request", reference: "#1" }],
      ciPassed: true,
      custom: { coverage: 0.95 },
    });
    expect(result.passed).toBe(true);
    expect(result.qualityScore).toBe(1);
  });

  it("fails deterministic quality when required evidence is absent", () => {
    const result = evaluateSuite([{ id: "tests", kind: "tests_passed", required: true }], { testsPassed: false });
    expect(result.passed).toBe(false);
    expect(result.results[0].score).toBe(0);
  });

  it("passes regression only when quality is non-inferior and cost policy passes", () => {
    const baseline = { variant: "baseline" as const, qualityScore: 0.95, successRate: 0.95, medianCostUsd: 1, sampleSize: 20 };
    const candidate = { variant: "candidate" as const, qualityScore: 0.94, successRate: 0.95, medianCostUsd: 0.6, sampleSize: 20 };
    const gate = evaluateRegressionGate({ baseline, candidate, qualityNonInferiorityMargin: 0.02, maxCostRegressionPct: 0 });
    expect(gate.passed).toBe(true);
    expect(gate.evidenceType).toBe("experiment_verified");
  });

  it("fails when a cheaper candidate loses too much quality", () => {
    const baseline = { variant: "baseline" as const, qualityScore: 0.95, successRate: 0.95, medianCostUsd: 1, sampleSize: 10 };
    const candidate = { variant: "candidate" as const, qualityScore: 0.7, successRate: 0.8, medianCostUsd: 0.1, sampleSize: 10 };
    expect(evaluateRegressionGate({ baseline, candidate }).passed).toBe(false);
  });
});

describe("verified savings evidence", () => {
  function rows(candidateCost = 0.6, candidateQuality = 0.94, candidateSuccess = true) {
    const benchmarkContext = { cache_read_tokens: 0, cache_write_tokens: 0, tool_call_count: 2 };
    return [
      ...Array.from({ length: 5 }, (_, index) => ({
        variant: "baseline",
        caseId: `case_${index}`,
        runId: `run_baseline_${index}`,
        qualityScore: 0.95,
        costUsd: 1 + index * 0.01,
        success: true,
        economicsSource: "linked_run",
        measurementScope: "full_session",
        benchmarkContext,
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        variant: "candidate",
        caseId: `case_${index}`,
        runId: `run_candidate_${index}`,
        qualityScore: candidateQuality,
        costUsd: candidateCost + index * 0.01,
        success: candidateSuccess,
        economicsSource: "linked_run",
        measurementScope: "full_session",
        benchmarkContext,
      })),
    ];
  }

  it("computes a verified per-observation savings snapshot from controlled evidence", () => {
    const result = evaluateExperimentRows({ status: "completed", rows: rows(), minimumQualityScore: 0.9, maxCostRegressionPct: 0 });
    expect(result.passed).toBe(true);
    expect(result.evidenceType).toBe("experiment_verified");
    expect(result.baseline.count).toBe(5);
    expect(result.candidate.count).toBe(5);
    expect(result.savings?.savingsPerObservationUsd).toBeCloseTo(0.4, 8);
    expect(result.savings?.savingsPct).toBeCloseTo(39.215686, 5);
  });

  it("refuses to verify savings with fewer than the minimum samples", () => {
    const result = evaluateExperimentRows({ status: "completed", rows: rows().slice(0, 8), minimumQualityScore: 0.9 });
    expect(result.passed).toBe(false);
    expect(result.evidenceType).toBe("insufficient_evidence");
    expect(result.savings).toBeNull();
  });

  it("refuses a cheaper candidate when success regresses", () => {
    const result = evaluateExperimentRows({ status: "completed", rows: rows(0.6, 0.94, false), minimumQualityScore: 0.9 });
    expect(result.passed).toBe(false);
    expect(result.evidenceType).toBe("experiment_rejected");
    expect(result.successPassed).toBe(false);
    expect(result.savings).toBeNull();
  });

  it("requires strict cost improvement even when quality is preserved", () => {
    const result = evaluateExperimentRows({ status: "completed", rows: rows(1.0), minimumQualityScore: 0.9 });
    expect(result.passed).toBe(false);
    expect(result.costImproved).toBe(false);
    expect(result.savings).toBeNull();
  });
});
