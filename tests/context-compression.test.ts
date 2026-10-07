import { describe, expect, it } from "vitest";

import { evaluateContextCompression } from "@/lib/optimization/context-compression";

describe("context compression evidence", () => {
  it("does not promote payload shrinkage to full-session savings", () => {
    const result = evaluateContextCompression({
      id: "payload-only",
      measurementScope: "payload_only",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      cachePrefixGate: "preserved",
      sampleSize: 10,
      baselineContextTokens: 20_000,
      deliveredContextTokens: 5_000,
    });

    expect(result.contextSavingsPct).toBe(75);
    expect(result.status).toBe("payload_reduction_only");
    expect(result.claimable).toBe(false);
  });

  it("fails when task-required evidence is removed", () => {
    const result = evaluateContextCompression({
      id: "evidence-loss",
      measurementScope: "full_session",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      cachePrefixGate: "preserved",
      sampleSize: 10,
      baselineContextTokens: 20_000,
      deliveredContextTokens: 6_000,
      baselineSessionTokens: 30_000,
      candidateSessionTokens: 15_000,
      requiredEvidenceRefs: ["auth-policy", "schema-contract"],
      preservedEvidenceRefs: ["auth-policy"],
    });

    expect(result.status).toBe("evidence_loss");
    expect(result.missingEvidenceRefs).toEqual(["schema-contract"]);
    expect(result.claimable).toBe(false);
  });

  it("blocks cache-prefix regressions independently of local compression ratio", () => {
    const result = evaluateContextCompression({
      id: "cache-prefix-change",
      measurementScope: "full_session",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      cachePrefixGate: "changed",
      sampleSize: 10,
      baselineContextTokens: 20_000,
      deliveredContextTokens: 4_000,
      baselineSessionTokens: 30_000,
      candidateSessionTokens: 12_000,
    });

    expect(result.status).toBe("cache_prefix_regression");
    expect(result.claimable).toBe(false);
  });

  it("charges auxiliary compression model usage, recovery and retries", () => {
    const result = evaluateContextCompression({
      id: "aux-heavy",
      measurementScope: "full_session",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      cachePrefixGate: "preserved",
      sampleSize: 10,
      baselineContextTokens: 20_000,
      deliveredContextTokens: 5_000,
      baselineSessionTokens: 20_000,
      candidateSessionTokens: 8_000,
      auxiliaryModelInputTokens: 5_000,
      auxiliaryModelOutputTokens: 2_000,
      recoveryTokens: 3_000,
      retryTokens: 4_000,
    });

    expect(result.netCandidateTokens).toBe(22_000);
    expect(result.status).toBe("token_regression");
  });

  it("verifies savings only with measured full-session quality evidence", () => {
    const result = evaluateContextCompression({
      id: "verified-compression",
      compressorVersion: "clean-room-v1",
      measurementScope: "full_session",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      cachePrefixGate: "preserved",
      sampleSize: 12,
      baselineContextTokens: 18_000,
      deliveredContextTokens: 7_000,
      baselineSessionTokens: 40_000,
      candidateSessionTokens: 22_000,
      auxiliaryModelInputTokens: 2_000,
      auxiliaryModelOutputTokens: 500,
      recoveryTokens: 500,
      retryTokens: 0,
      compressionLatencyMs: 35,
      requiredEvidenceRefs: ["a", "b"],
      preservedEvidenceRefs: ["b", "a"],
      evidenceSource: "paired-run-receipts",
    });

    expect(result.netCandidateTokens).toBe(25_000);
    expect(result.measuredSavingsTokens).toBe(15_000);
    expect(result.measuredSavingsPct).toBe(37.5);
    expect(result.status).toBe("verified_savings");
    expect(result.claimable).toBe(true);
  });
});
