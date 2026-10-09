import { describe, expect, it } from "vitest";

import { evaluateRoutingEconomics } from "@/lib/optimization/routing-economics";

describe("routing economics evidence", () => {
  it("never exposes a token-savings claim for cheaper routing", () => {
    const result = evaluateRoutingEconomics({
      id: "cheap-route",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      routeProvenanceGate: "verified",
      sampleSize: 10,
      baselineCostUsd: 10,
      candidateCostUsd: 4,
      baselineTokens: 10_000,
      candidateTokens: 14_000,
      baselineRoute: "provider-a/premium",
      resolvedRoutes: ["provider-b/cheap"],
    });

    expect(result.status).toBe("verified_cost_savings");
    expect(result.costSavingsClaimable).toBe(true);
    expect(result.tokenSavingsClaimable).toBe(false);
    expect(result.claimClass).toBe("cost_reduction_only");
    expect(result.observedTokenDelta).toBe(4_000);
  });

  it("fails closed on silent route substitution", () => {
    const result = evaluateRoutingEconomics({
      id: "silent-fallback",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      routeProvenanceGate: "verified",
      sampleSize: 10,
      baselineCostUsd: 10,
      candidateCostUsd: 4,
      requiredExactRoute: true,
      silentSubstitutionObserved: true,
      resolvedRoutes: ["unexpected-provider/model"],
    });

    expect(result.status).toBe("route_provenance_failure");
    expect(result.costSavingsClaimable).toBe(false);
  });

  it("charges routing and fallback cost to the candidate", () => {
    const result = evaluateRoutingEconomics({
      id: "fallback-expensive",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      routeProvenanceGate: "verified",
      sampleSize: 10,
      baselineCostUsd: 5,
      candidateCostUsd: 2,
      routingOverheadCostUsd: 1,
      fallbackCostUsd: 3,
      resolvedRoutes: ["cheap/model", "fallback/model"],
    });

    expect(result.netCandidateCostUsd).toBe(6);
    expect(result.status).toBe("cost_regression");
  });

  it("requires measured quality-gated route evidence", () => {
    const result = evaluateRoutingEconomics({
      id: "modeled-route",
      evidenceType: "modeled_estimate",
      qualityGate: "passed",
      routeProvenanceGate: "verified",
      sampleSize: 20,
      baselineCostUsd: 10,
      candidateCostUsd: 5,
      resolvedRoutes: ["cheap/model"],
    });

    expect(result.status).toBe("candidate");
    expect(result.costSavingsClaimable).toBe(false);
  });

  it("verifies cost savings with authoritative routes and equivalent quality", () => {
    const result = evaluateRoutingEconomics({
      id: "verified-routing",
      policyVersion: "clean-room-v1",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      routeProvenanceGate: "verified",
      sampleSize: 12,
      baselineCostUsd: 12,
      candidateCostUsd: 5,
      routingOverheadCostUsd: 0.5,
      fallbackCostUsd: 0.5,
      baselineTokens: 20_000,
      candidateTokens: 22_000,
      fallbackTokens: 1_000,
      baselineRoute: "premium/model",
      resolvedRoutes: ["economy/model"],
      requiredExactRoute: true,
      silentSubstitutionObserved: false,
      evidenceSource: "gateway-route-receipts",
    });

    expect(result.netCandidateCostUsd).toBe(6);
    expect(result.measuredCostSavingsUsd).toBe(6);
    expect(result.measuredCostSavingsPct).toBe(50);
    expect(result.observedTokenDelta).toBe(3_000);
    expect(result.status).toBe("verified_cost_savings");
    expect(result.costSavingsClaimable).toBe(true);
    expect(result.tokenSavingsClaimable).toBe(false);
  });
});
