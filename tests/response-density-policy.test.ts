import { describe, expect, it } from "vitest";

import { evaluateResponseDensityPolicy } from "@/lib/optimization/response-density-policy";

const preservationClasses = [
  "code",
  "errors",
  "identifiers",
  "paths_commands",
  "numbers_versions",
  "security_warnings",
  "irreversible_confirmations",
];

describe("response density policy evidence", () => {
  it("does not convert shorter visible replies into verified session savings", () => {
    const result = evaluateResponseDensityPolicy({
      id: "output-only",
      level: "dense",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      sampleSize: 10,
      baselineOutputTokens: 1_000,
      candidateOutputTokens: 200,
      baselineSessionTokens: null,
      candidateSessionTokens: null,
      requiredPreservationClasses: preservationClasses,
      preservedClasses: preservationClasses,
      persistenceVerified: true,
    });

    expect(result.measuredOutputReductionPct).toBe(80);
    expect(result.status).toBe("output_reduction_only");
    expect(result.claimable).toBe(false);
  });

  it("charges repeated instruction overhead and retries to the candidate", () => {
    const result = evaluateResponseDensityPolicy({
      id: "overhead-regression",
      level: "dense",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      sampleSize: 8,
      baselineOutputTokens: 3_000,
      candidateOutputTokens: 1_000,
      baselineSessionTokens: 10_000,
      candidateSessionTokens: 8_000,
      instructionOverheadTokens: 1_500,
      retryTokens: 1_000,
      requiredPreservationClasses: preservationClasses,
      preservedClasses: preservationClasses,
      persistenceVerified: true,
      baselineClarificationTurns: 0,
      candidateClarificationTurns: 0,
    });

    expect(result.netCandidateSessionTokens).toBe(10_500);
    expect(result.status).toBe("token_regression");
    expect(result.claimable).toBe(false);
  });

  it("fails closed if a required exact-content class is lost", () => {
    const result = evaluateResponseDensityPolicy({
      id: "lost-error",
      level: "extreme",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      sampleSize: 10,
      baselineOutputTokens: 4_000,
      candidateOutputTokens: 500,
      baselineSessionTokens: 12_000,
      candidateSessionTokens: 6_000,
      requiredPreservationClasses: preservationClasses,
      preservedClasses: preservationClasses.filter((value) => value !== "errors"),
      persistenceVerified: true,
      baselineClarificationTurns: 0,
      candidateClarificationTurns: 0,
    });

    expect(result.status).toBe("preservation_failure");
    expect(result.missingPreservationClasses).toEqual(["errors"]);
    expect(result.claimable).toBe(false);
  });

  it("blocks claims when the policy drifts or silently stops applying", () => {
    const result = evaluateResponseDensityPolicy({
      id: "drift",
      level: "dense",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      sampleSize: 10,
      baselineOutputTokens: 4_000,
      candidateOutputTokens: 1_000,
      baselineSessionTokens: 12_000,
      candidateSessionTokens: 7_000,
      requiredPreservationClasses: preservationClasses,
      preservedClasses: preservationClasses,
      persistenceVerified: false,
    });

    expect(result.status).toBe("persistence_failure");
    expect(result.claimable).toBe(false);
  });

  it("treats extra clarification turns as an ambiguity regression", () => {
    const result = evaluateResponseDensityPolicy({
      id: "too-terse",
      level: "extreme",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      sampleSize: 10,
      baselineOutputTokens: 4_000,
      candidateOutputTokens: 700,
      baselineSessionTokens: 15_000,
      candidateSessionTokens: 8_000,
      requiredPreservationClasses: preservationClasses,
      preservedClasses: preservationClasses,
      persistenceVerified: true,
      baselineClarificationTurns: 1,
      candidateClarificationTurns: 3,
    });

    expect(result.clarificationDelta).toBe(2);
    expect(result.status).toBe("ambiguity_regression");
    expect(result.claimable).toBe(false);
  });

  it("requires enough paired measured samples and a passed quality gate", () => {
    const result = evaluateResponseDensityPolicy({
      id: "small-cohort",
      level: "readable",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      sampleSize: 2,
      baselineOutputTokens: 4_000,
      candidateOutputTokens: 2_500,
      baselineSessionTokens: 15_000,
      candidateSessionTokens: 11_000,
      requiredPreservationClasses: preservationClasses,
      preservedClasses: preservationClasses,
      persistenceVerified: true,
      baselineClarificationTurns: 0,
      candidateClarificationTurns: 0,
    });

    expect(result.status).toBe("insufficient_samples");
    expect(result.claimable).toBe(false);
  });

  it("verifies only full-session savings with preservation, persistence and quality evidence", () => {
    const result = evaluateResponseDensityPolicy({
      id: "verified-density-profile",
      policyVersion: "response-density-v1",
      level: "dense",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      sampleSize: 12,
      baselineOutputTokens: 8_000,
      candidateOutputTokens: 2_000,
      baselineSessionTokens: 30_000,
      candidateSessionTokens: 18_000,
      instructionOverheadTokens: 1_000,
      retryTokens: 500,
      requiredPreservationClasses: preservationClasses,
      preservedClasses: preservationClasses,
      persistenceVerified: true,
      baselineClarificationTurns: 1,
      candidateClarificationTurns: 1,
      evidenceSource: "paired-run-receipts",
    });

    expect(result.measuredOutputReductionPct).toBe(75);
    expect(result.netCandidateSessionTokens).toBe(19_500);
    expect(result.measuredSessionSavingsTokens).toBe(10_500);
    expect(result.measuredSessionSavingsPct).toBe(35);
    expect(result.status).toBe("verified_savings");
    expect(result.claimable).toBe(true);
    expect(result.verificationRequired).toBeNull();
  });
});
