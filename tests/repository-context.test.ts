import { describe, expect, it } from "vitest";

import { evaluateRepositoryContext } from "@/lib/optimization/repository-context";

describe("repository context evidence", () => {
  it("blocks stale indexes even when token totals look better", () => {
    const result = evaluateRepositoryContext({
      id: "stale-graph",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      indexState: "stale",
      sampleSize: 10,
      baselineSessionTokens: 20_000,
      candidateSessionTokens: 5_000,
    });

    expect(result.status).toBe("stale_index");
    expect(result.claimable).toBe(false);
  });

  it("fails when required repository evidence was not retrieved", () => {
    const result = evaluateRepositoryContext({
      id: "retrieval-miss",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      indexState: "fresh",
      sampleSize: 8,
      baselineSessionTokens: 20_000,
      candidateSessionTokens: 8_000,
      requiredEvidenceRefs: ["auth-entry", "rate-limit-config"],
      returnedEvidenceRefs: ["auth-entry"],
    });

    expect(result.status).toBe("retrieval_failure");
    expect(result.missingEvidenceRefs).toEqual(["rate-limit-config"]);
  });

  it("charges fallback file reads to the candidate", () => {
    const result = evaluateRepositoryContext({
      id: "fallback-heavy",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      indexState: "fresh",
      sampleSize: 8,
      baselineSessionTokens: 12_000,
      candidateSessionTokens: 4_000,
      fallbackReadTokens: 9_000,
    });

    expect(result.netCandidateTokens).toBe(13_000);
    expect(result.status).toBe("token_regression");
    expect(result.claimable).toBe(false);
  });

  it("requires measured evidence and enough samples", () => {
    const modeled = evaluateRepositoryContext({
      id: "modeled",
      evidenceType: "modeled_estimate",
      qualityGate: "passed",
      indexState: "fresh",
      sampleSize: 20,
      baselineSessionTokens: 20_000,
      candidateSessionTokens: 10_000,
    });
    expect(modeled.status).toBe("candidate");

    const small = evaluateRepositoryContext({
      id: "small",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      indexState: "fresh",
      sampleSize: 2,
      baselineSessionTokens: 20_000,
      candidateSessionTokens: 10_000,
    });
    expect(small.status).toBe("insufficient_samples");
  });

  it("verifies only fresh, complete, quality-gated full-session evidence", () => {
    const result = evaluateRepositoryContext({
      id: "verified-repository-context",
      strategyVersion: "clean-room-v1",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      indexState: "fresh",
      sampleSize: 12,
      baselineSessionTokens: 30_000,
      candidateSessionTokens: 15_000,
      fallbackReadTokens: 1_000,
      indexingSetupMs: 900,
      retrievalLatencyMs: 20,
      requiredEvidenceRefs: ["auth-entry", "rate-limit-config"],
      returnedEvidenceRefs: ["rate-limit-config", "auth-entry"],
      evidenceSource: "paired-run-receipts",
    });

    expect(result.netCandidateTokens).toBe(16_000);
    expect(result.measuredSavingsTokens).toBe(14_000);
    expect(result.measuredSavingsPct).toBe(46.67);
    expect(result.status).toBe("verified_savings");
    expect(result.claimable).toBe(true);
    expect(result.verificationRequired).toBeNull();
  });
});
