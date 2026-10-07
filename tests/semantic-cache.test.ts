import { describe, expect, it } from "vitest";

import { evaluateSemanticCache } from "@/lib/optimization/semantic-cache";

describe("semantic cache evidence", () => {
  it("blocks unverified tenant isolation", () => {
    const result = evaluateSemanticCache({
      id: "unverified-isolation",
      cacheMode: "semantic",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      freshness: "fresh",
      isolationGate: "not_run",
      sampleSize: 20,
      baselineSessionTokens: 20_000,
      candidateSessionTokens: 5_000,
      observedHits: 8,
      observedMisses: 2,
      observedFalseHits: 0,
    });

    expect(result.status).toBe("tenant_isolation_unverified");
    expect(result.claimable).toBe(false);
  });

  it("blocks stale cache entries", () => {
    const result = evaluateSemanticCache({
      id: "stale-cache",
      cacheMode: "exact",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      freshness: "stale",
      isolationGate: "verified",
      sampleSize: 20,
      baselineSessionTokens: 20_000,
      candidateSessionTokens: 4_000,
      observedHits: 9,
      observedMisses: 1,
      observedFalseHits: 0,
    });

    expect(result.status).toBe("stale_cache");
    expect(result.claimable).toBe(false);
  });

  it("blocks false-hit regressions for semantic caches", () => {
    const result = evaluateSemanticCache({
      id: "false-hit",
      cacheMode: "semantic",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      freshness: "fresh",
      isolationGate: "verified",
      sampleSize: 20,
      baselineSessionTokens: 20_000,
      candidateSessionTokens: 6_000,
      observedHits: 10,
      observedMisses: 2,
      observedFalseHits: 1,
      maxFalseHitRate: 0.05,
    });

    expect(result.falseHitRate).toBe(0.1);
    expect(result.status).toBe("false_hit_regression");
    expect(result.claimable).toBe(false);
  });

  it("charges lookup, validation, false-hit recovery and fallback tokens", () => {
    const result = evaluateSemanticCache({
      id: "overhead-heavy",
      cacheMode: "semantic",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      freshness: "fresh",
      isolationGate: "verified",
      sampleSize: 20,
      baselineSessionTokens: 10_000,
      candidateSessionTokens: 2_000,
      lookupOverheadTokens: 1_000,
      validationTokens: 1_000,
      falseHitRecoveryTokens: 3_000,
      providerFallbackTokens: 4_000,
      observedHits: 8,
      observedMisses: 2,
      observedFalseHits: 0,
    });

    expect(result.netCandidateTokens).toBe(11_000);
    expect(result.status).toBe("token_regression");
    expect(result.claimable).toBe(false);
  });

  it("verifies savings only with measured, fresh, isolated, quality-gated evidence", () => {
    const result = evaluateSemanticCache({
      id: "verified-cache",
      cacheMode: "semantic",
      cacheVersion: "clean-room-v1",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      freshness: "fresh",
      isolationGate: "verified",
      sampleSize: 30,
      baselineSessionTokens: 50_000,
      candidateSessionTokens: 15_000,
      lookupOverheadTokens: 1_000,
      validationTokens: 1_000,
      falseHitRecoveryTokens: 0,
      providerFallbackTokens: 3_000,
      observedHits: 20,
      observedMisses: 10,
      observedFalseHits: 0,
      maxFalseHitRate: 0,
      evidenceSource: "paired-run-receipts",
    });

    expect(result.hitRate).toBe(0.6667);
    expect(result.falseHitRate).toBe(0);
    expect(result.netCandidateTokens).toBe(20_000);
    expect(result.measuredSavingsTokens).toBe(30_000);
    expect(result.measuredSavingsPct).toBe(60);
    expect(result.status).toBe("verified_savings");
    expect(result.claimable).toBe(true);
    expect(result.verificationRequired).toBeNull();
  });
});
