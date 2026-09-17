import { describe, expect, it } from "vitest";
import { evaluateRegressionGate, evaluateSuite } from "@/lib/evaluations/engine";

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
