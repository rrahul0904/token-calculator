import { describe, expect, it } from "vitest";

import { evaluateOrchestrationEfficiency } from "@/lib/optimization/orchestration-efficiency";

describe("orchestration efficiency evidence", () => {
  it("charges coordinator, handoff, retry and fallback tokens", () => {
    const result = evaluateOrchestrationEfficiency({
      id: "bounded-delegation",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      provenanceGate: "verified",
      sampleSize: 10,
      baselineSessionTokens: 20_000,
      candidateWorkerTokens: 10_000,
      coordinatorTokens: 2_000,
      handoffTokens: 1_000,
      retryTokens: 500,
      fallbackTokens: 500,
      observedMaxFanout: 3,
      maxAllowedFanout: 4,
    });

    expect(result.netCandidateSessionTokens).toBe(14_000);
    expect(result.measuredSavingsTokens).toBe(6_000);
    expect(result.measuredSavingsPct).toBe(30);
    expect(result.status).toBe("verified_savings");
    expect(result.claimable).toBe(true);
  });

  it("fails closed on unverified worker provenance", () => {
    const result = evaluateOrchestrationEfficiency({
      id: "unverified-workers",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      provenanceGate: "not_run",
      sampleSize: 10,
      baselineSessionTokens: 20_000,
      candidateWorkerTokens: 5_000,
    });

    expect(result.status).toBe("provenance_unverified");
    expect(result.claimable).toBe(false);
  });

  it("blocks unbounded delegation fanout", () => {
    const result = evaluateOrchestrationEfficiency({
      id: "fanout",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      provenanceGate: "verified",
      sampleSize: 10,
      baselineSessionTokens: 20_000,
      candidateWorkerTokens: 5_000,
      observedMaxFanout: 12,
      maxAllowedFanout: 4,
    });

    expect(result.status).toBe("fanout_guardrail_breach");
  });

  it("detects when orchestration overhead erases worker savings", () => {
    const result = evaluateOrchestrationEfficiency({
      id: "over-orchestrated",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      provenanceGate: "verified",
      sampleSize: 10,
      baselineSessionTokens: 10_000,
      candidateWorkerTokens: 7_000,
      coordinatorTokens: 2_000,
      handoffTokens: 1_500,
      retryTokens: 500,
    });

    expect(result.netCandidateSessionTokens).toBe(11_000);
    expect(result.status).toBe("token_regression");
    expect(result.claimable).toBe(false);
  });
});
