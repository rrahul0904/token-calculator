import { describe, expect, it } from "vitest";

import { evaluatePromptCacheEconomics } from "@/lib/optimization/prompt-cache-economics";

describe("prompt cache economics", () => {
  it("verifies cost savings without inventing raw token savings", () => {
    const result = evaluatePromptCacheEconomics({
      id: "stable-prefix",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      cacheAccountingGate: "verified",
      sampleSize: 12,
      baselineCostUsd: 12,
      candidateCostUsd: 6,
      cacheControlOverheadCostUsd: 0.5,
      fallbackCostUsd: 0.5,
      baselineLogicalTokens: 20_000,
      candidateLogicalTokens: 20_000,
      cacheReadTokens: 14_000,
      cacheWriteTokens: 2_000,
      stablePrefixRate: 0.95,
      minimumStablePrefixRate: 0.8,
    });

    expect(result.status).toBe("verified_cost_savings");
    expect(result.measuredCostSavingsUsd).toBe(5);
    expect(result.costSavingsClaimable).toBe(true);
    expect(result.tokenSavingsClaimable).toBe(false);
    expect(result.observedLogicalTokenDelta).toBe(0);
  });

  it("fails closed when cache accounting is not authoritative", () => {
    const result = evaluatePromptCacheEconomics({
      id: "self-reported-cache",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      cacheAccountingGate: "not_run",
      sampleSize: 20,
      baselineCostUsd: 10,
      candidateCostUsd: 2,
    });

    expect(result.status).toBe("cache_accounting_unverified");
    expect(result.costSavingsClaimable).toBe(false);
  });

  it("charges cache-control and fallback cost to the candidate", () => {
    const result = evaluatePromptCacheEconomics({
      id: "expensive-cache",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      cacheAccountingGate: "verified",
      sampleSize: 10,
      baselineCostUsd: 5,
      candidateCostUsd: 2,
      cacheControlOverheadCostUsd: 1,
      fallbackCostUsd: 3,
    });

    expect(result.netCandidateCostUsd).toBe(6);
    expect(result.status).toBe("cost_regression");
  });

  it("blocks unstable prompt prefixes", () => {
    const result = evaluatePromptCacheEconomics({
      id: "churning-prefix",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      cacheAccountingGate: "verified",
      sampleSize: 10,
      baselineCostUsd: 10,
      candidateCostUsd: 4,
      stablePrefixRate: 0.4,
      minimumStablePrefixRate: 0.8,
    });

    expect(result.status).toBe("prefix_instability");
  });
});
