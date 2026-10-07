import { describe, expect, it } from "vitest";

import {
  analyzeTokenSavingCandidate,
  analyzeTokenSavingPortfolio,
} from "@/lib/optimization/portfolio-analysis";

describe("token-saving portfolio analysis facade", () => {
  it("normalizes verified token-reduction evidence", () => {
    const decision = analyzeTokenSavingCandidate({
      kind: "output_reduction",
      candidate: {
        id: "output-reducer",
        measurementScope: "full_session",
        evidenceType: "measured_before_after",
        qualityGate: "passed",
        sampleSize: 10,
        baselineTokens: 20_000,
        deliveredTokens: 10_000,
        requiredSignals: ["error"],
        preservedSignals: ["error"],
      },
    });

    expect(decision.status).toBe("verified_savings");
    expect(decision.claimable).toBe(true);
    expect(decision.claimClass).toBe("token_reduction");
    expect(decision.savingsPct).toBe(50);
  });

  it("keeps routing economics cost-only even when verified", () => {
    const decision = analyzeTokenSavingCandidate({
      kind: "routing_economics",
      candidate: {
        id: "route-policy",
        evidenceType: "measured_before_after",
        qualityGate: "passed",
        routeProvenanceGate: "verified",
        sampleSize: 10,
        baselineCostUsd: 10,
        candidateCostUsd: 5,
        baselineTokens: 10_000,
        candidateTokens: 15_000,
        resolvedRoutes: ["economy/model"],
      },
    });

    expect(decision.status).toBe("verified_cost_savings");
    expect(decision.claimable).toBe(true);
    expect(decision.claimClass).toBe("cost_reduction_only");
    expect(decision.savingsPct).toBe(50);
  });

  it("normalizes response-density session savings rather than output-only reduction", () => {
    const decision = analyzeTokenSavingCandidate({
      kind: "response_density",
      candidate: {
        id: "dense-policy",
        level: "dense",
        evidenceType: "measured_before_after",
        qualityGate: "passed",
        sampleSize: 10,
        baselineOutputTokens: 10_000,
        candidateOutputTokens: 4_000,
        baselineSessionTokens: 20_000,
        candidateSessionTokens: 15_000,
        persistenceVerified: true,
      },
    });

    expect(decision.status).toBe("verified_savings");
    expect(decision.savingsPct).toBe(25);
  });

  it("returns one metadata-only report without additive savings", () => {
    const report = analyzeTokenSavingPortfolio([
      {
        kind: "semantic_cache",
        candidate: {
          id: "cache",
          cacheMode: "exact",
          evidenceType: "measured_before_after",
          qualityGate: "passed",
          freshness: "fresh",
          isolationGate: "verified",
          sampleSize: 10,
          baselineSessionTokens: 20_000,
          candidateSessionTokens: 10_000,
          observedHits: 5,
          observedMisses: 5,
          observedFalseHits: 0,
        },
      },
      {
        kind: "routing_economics",
        candidate: {
          id: "route",
          evidenceType: "measured_before_after",
          qualityGate: "passed",
          routeProvenanceGate: "verified",
          sampleSize: 10,
          baselineCostUsd: 10,
          candidateCostUsd: 5,
          resolvedRoutes: ["economy/model"],
        },
      },
    ]);

    expect(report.summary.candidates).toBe(2);
    expect(report.summary.claimable).toBe(2);
    expect(report.summary.tokenReductionClaims).toBe(1);
    expect(report.summary.costOnlyClaims).toBe(1);
    expect(report.summary.additiveSavingsClaimed).toBe(false);
    expect(report.summary.aggregateSavingsPct).toBeNull();
    expect(report.privacy.promptContentRequired).toBe(false);
  });
});
