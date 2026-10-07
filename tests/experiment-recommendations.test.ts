import { describe, expect, it } from "vitest";

import { recommendOptimizationExperiments } from "@/lib/optimization/experiment-recommendations";
import type { NormalizedPortfolioDecision } from "@/lib/optimization/portfolio-analysis";

function decision(overrides: Partial<NormalizedPortfolioDecision> = {}): NormalizedPortfolioDecision {
  return {
    kind: "output_reduction",
    id: "candidate-a",
    status: "insufficient_samples",
    claimable: false,
    claimClass: "token_reduction",
    savingsPct: 30,
    verificationRequired: "Collect more samples.",
    raw: {},
    ...overrides,
  };
}

describe("optimization experiment recommendations", () => {
  it("never auto-activates an optimizer", () => {
    const [recommendation] = recommendOptimizationExperiments([decision()]);

    expect(recommendation.autoActivate).toBe(false);
    expect(recommendation.activationPolicy).toBe("manual_after_verified_evidence");
    expect(recommendation.workloadRule).toBe("same_versioned_cohort");
    expect(recommendation.measurementScope).toBe("full_session");
  });

  it("prioritizes regressions for remediation before benchmarking", () => {
    const recommendations = recommendOptimizationExperiments([
      decision({ id: "benchmark", status: "insufficient_samples" }),
      decision({ id: "regression", status: "token_regression", verificationRequired: "Candidate uses more tokens." }),
    ]);

    expect(recommendations[0].candidateId).toBe("regression");
    expect(recommendations[0].readiness).toBe("remediation_required");
    expect(recommendations[0].priority).toBe("high");
  });

  it("requires evidence before unverified safety and provenance boundaries", () => {
    const recommendations = recommendOptimizationExperiments([
      decision({
        id: "cache-isolation",
        kind: "semantic_cache",
        status: "tenant_isolation_unverified",
        verificationRequired: "Verify isolation.",
      }),
      decision({
        id: "route-provenance",
        kind: "routing_economics",
        claimClass: "cost_reduction_only",
        status: "route_provenance_unverified",
        verificationRequired: "Verify routes.",
      }),
    ]);

    expect(recommendations.every((item) => item.readiness === "evidence_required")).toBe(true);
    expect(recommendations.find((item) => item.candidateId === "cache-isolation")?.requiredEvidence).toContain("tenant/authorization isolation evidence");
    expect(recommendations.find((item) => item.candidateId === "route-provenance")?.requiredEvidence).toContain("authoritative provider/model route provenance");
  });

  it("keeps routing acceptance criteria cost-only", () => {
    const [recommendation] = recommendOptimizationExperiments([
      decision({
        id: "route",
        kind: "routing_economics",
        claimClass: "cost_reduction_only",
        status: "candidate",
      }),
    ]);

    expect(recommendation.acceptanceCriteria).toContain("result remains classified as cost savings, not token savings");
  });

  it("marks already verified candidates as no-priority without changing activation policy", () => {
    const [recommendation] = recommendOptimizationExperiments([
      decision({
        id: "verified",
        status: "verified_savings",
        claimable: true,
        verificationRequired: null,
      }),
    ]);

    expect(recommendation.readiness).toBe("already_verified");
    expect(recommendation.priority).toBe("none");
    expect(recommendation.autoActivate).toBe(false);
  });

  it("enforces a minimum five-case recommendation even when a smaller number is requested", () => {
    const [recommendation] = recommendOptimizationExperiments([decision()], { minimumSampleSize: 2 });
    expect(recommendation.recommendedSampleSize).toBe(5);
  });
});
