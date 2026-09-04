import { describe, expect, it } from "vitest";
import { experimentEvidence } from "@/lib/evaluations/experiment-evidence";

const baseline = { count: 5, successRate: 1, medianQuality: 0.95, medianCostUsd: 1 };
const candidate = { count: 5, successRate: 1, medianQuality: 0.94, medianCostUsd: 0.6 };

describe("experiment evidence labels", () => {
  it("does not promote recorded results to verified evidence", () => {
    expect(experimentEvidence({ status: "completed", resultCount: 1, baseline: { ...baseline, count: 1 }, candidate: { ...candidate, count: 0 }, minimumQualityScore: null })).toBe("results_recorded");
  });

  it("requires a completed, sufficiently sampled cheaper and non-inferior candidate", () => {
    expect(experimentEvidence({ status: "completed", resultCount: 10, baseline, candidate, minimumQualityScore: null })).toBe("experiment_verified");
  });

  it("keeps a cheaper but lower-quality candidate unverified", () => {
    expect(experimentEvidence({ status: "completed", resultCount: 10, baseline, candidate: { ...candidate, medianQuality: 0.7 }, minimumQualityScore: null })).toBe("results_recorded");
  });
});
