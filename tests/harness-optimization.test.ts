import { describe, expect, it } from "vitest";
import { evaluateHarnessCandidate, evaluateHarnessOptimizations } from "@/lib/optimization/harness";

describe("harness optimization evidence", () => {
  it("verifies measured savings only after the sample and quality gates pass", () => {
    const result = evaluateHarnessCandidate({
      id: "reducer-shell",
      kind: "output_reducer",
      baselineTokens: 10_000,
      deliveredTokens: 4_000,
      sampleSize: 8,
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      evidenceSource: "benchmark:v1",
    });

    expect(result.status).toBe("verified_savings");
    expect(result.claimable).toBe(true);
    expect(result.measuredSavingsTokens).toBe(6_000);
    expect(result.measuredSavingsPct).toBe(60);
    expect(result.verificationRequired).toBeNull();
  });

  it("does not promote a modeled estimate into a verified savings claim", () => {
    const result = evaluateHarnessCandidate({
      id: "lazy-tools",
      kind: "lazy_tool_catalog",
      baselineTokens: 5_000,
      deliveredTokens: 1_500,
      sampleSize: 20,
      evidenceType: "modeled_estimate",
      qualityGate: "passed",
    });

    expect(result.status).toBe("candidate");
    expect(result.claimable).toBe(false);
    expect(result.measuredSavingsPct).toBe(70);
    expect(result.verificationRequired).toContain("measured before/after");
  });

  it("blocks a token-saving optimizer when the quality gate fails", () => {
    const result = evaluateHarnessCandidate({
      id: "context-compressor",
      kind: "context_compaction",
      baselineTokens: 20_000,
      deliveredTokens: 8_000,
      sampleSize: 10,
      evidenceType: "measured_before_after",
      qualityGate: "failed",
    });

    expect(result.status).toBe("quality_regression");
    expect(result.claimable).toBe(false);
  });

  it("detects an optimizer that increases token delivery", () => {
    const result = evaluateHarnessCandidate({
      id: "repo-context",
      kind: "repository_context",
      baselineTokens: 2_000,
      deliveredTokens: 2_500,
      sampleSize: 9,
      evidenceType: "measured_before_after",
      qualityGate: "passed",
    });

    expect(result.status).toBe("token_regression");
    expect(result.measuredSavingsTokens).toBe(-500);
    expect(result.measuredSavingsPct).toBe(-25);
  });

  it("requires the configured minimum sample size", () => {
    const result = evaluateHarnessCandidate({
      id: "small-sample",
      kind: "output_reducer",
      baselineTokens: 1_000,
      deliveredTokens: 500,
      sampleSize: 4,
      evidenceType: "measured_before_after",
      qualityGate: "passed",
    }, { minimumSampleSize: 5 });

    expect(result.status).toBe("insufficient_samples");
    expect(result.claimable).toBe(false);
  });

  it("never sums component savings because optimizer effects may overlap", () => {
    const report = evaluateHarnessOptimizations([
      {
        id: "reducer",
        kind: "output_reducer",
        baselineTokens: 10_000,
        deliveredTokens: 5_000,
        sampleSize: 10,
        evidenceType: "measured_before_after",
        qualityGate: "passed",
      },
      {
        id: "lazy-tools",
        kind: "lazy_tool_catalog",
        baselineTokens: 10_000,
        deliveredTokens: 7_500,
        sampleSize: 10,
        evidenceType: "measured_before_after",
        qualityGate: "passed",
      },
    ]);

    expect(report.summary.verifiedComponents).toBe(2);
    expect(report.summary.bestVerifiedSavingsPct).toBe(50);
    expect(report.summary.bestVerifiedComponentId).toBe("reducer");
    expect(report.summary.additiveSavingsClaimed).toBe(false);
    expect(report.summary.aggregateSavingsTokens).toBeNull();
    expect(report.privacy).toEqual({
      metadataOnly: true,
      promptContentRequired: false,
      sourceCodeRequired: false,
      rawToolOutputRequired: false,
    });
  });
});
