import { describe, expect, it } from "vitest";

import { evaluateOutputReduction } from "@/lib/optimization/output-reduction";

describe("output reduction evidence", () => {
  it("does not convert payload compression into verified full-session savings", () => {
    const result = evaluateOutputReduction({
      id: "rtk-like-payload",
      measurementScope: "payload_only",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      sampleSize: 10,
      baselineTokens: 10_000,
      deliveredTokens: 1_000,
      requiredSignals: ["build_error"],
      preservedSignals: ["build_error"],
    });

    expect(result.status).toBe("payload_reduction_only");
    expect(result.claimable).toBe(false);
    expect(result.measuredSavingsPct).toBe(90);
  });

  it("charges retry and reducer overhead to the candidate session", () => {
    const result = evaluateOutputReduction({
      id: "retry-heavy",
      measurementScope: "full_session",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      sampleSize: 8,
      baselineTokens: 5_000,
      deliveredTokens: 2_000,
      retryTokens: 3_500,
      reducerOverheadTokens: 250,
      requiredSignals: ["test_failure"],
      preservedSignals: ["test_failure"],
    });

    expect(result.netCandidateTokens).toBe(5_750);
    expect(result.status).toBe("token_regression");
    expect(result.claimable).toBe(false);
  });

  it("fails closed when required decision signals disappear", () => {
    const result = evaluateOutputReduction({
      id: "signal-loss",
      measurementScope: "full_session",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      sampleSize: 10,
      baselineTokens: 10_000,
      deliveredTokens: 2_500,
      requiredSignals: ["compiler_error", "failing_test"],
      preservedSignals: ["compiler_error"],
    });

    expect(result.status).toBe("signal_loss");
    expect(result.missingSignals).toEqual(["failing_test"]);
    expect(result.claimable).toBe(false);
  });

  it("requires a passed task-quality gate", () => {
    const result = evaluateOutputReduction({
      id: "quality-not-run",
      measurementScope: "full_session",
      evidenceType: "measured_before_after",
      qualityGate: "not_run",
      sampleSize: 10,
      baselineTokens: 10_000,
      deliveredTokens: 5_000,
    });

    expect(result.status).toBe("quality_unverified");
    expect(result.claimable).toBe(false);
  });

  it("requires enough comparable full-session samples", () => {
    const result = evaluateOutputReduction({
      id: "small-cohort",
      measurementScope: "full_session",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      sampleSize: 2,
      baselineTokens: 10_000,
      deliveredTokens: 5_000,
    });

    expect(result.status).toBe("insufficient_samples");
    expect(result.claimable).toBe(false);
  });

  it("verifies savings only after all evidence gates pass", () => {
    const result = evaluateOutputReduction({
      id: "verified-reducer",
      reducerVersion: "clean-room-v1",
      measurementScope: "full_session",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      sampleSize: 12,
      baselineTokens: 20_000,
      deliveredTokens: 11_000,
      retryTokens: 500,
      reducerOverheadTokens: 500,
      requiredSignals: ["error", "warning"],
      preservedSignals: ["warning", "error"],
      evidenceSource: "paired-run-receipts",
    });

    expect(result.netCandidateTokens).toBe(12_000);
    expect(result.measuredSavingsTokens).toBe(8_000);
    expect(result.measuredSavingsPct).toBe(40);
    expect(result.status).toBe("verified_savings");
    expect(result.claimable).toBe(true);
    expect(result.verificationRequired).toBeNull();
  });
});
