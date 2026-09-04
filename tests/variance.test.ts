import { describe, expect, it } from "vitest";
import { MODEL_CATALOG } from "@/lib/models";
import { DEFAULT_WORKLOAD_SCENARIO, estimateWorkload } from "@/lib/economics/workload";
import { explainRunVariance } from "@/lib/economics/variance";
import { advisoryFromEstimate } from "@/lib/economics/advisory";

describe("planned vs actual economics", () => {
  const model = MODEL_CATALOG.find((item) => item.id === "glm-5.3-flash")!;
  const plan = estimateWorkload(model, DEFAULT_WORKLOAD_SCENARIO);

  it("reports observed token/count deltas without fabricating dollar attribution", () => {
    const variance = explainRunVariance(plan, {
      costUsd: 21,
      costSource: "provider_measured",
      freshInputTokens: plan.buckets.freshInputTokens + 1_000_000,
      cacheReadTokens: plan.buckets.cachedReadTokens - 1_000_000,
      cacheWriteTokens: 0,
      reasoningTokens: 50_000,
      outputTokens: plan.buckets.outputTokens + 20_000,
      retryCount: 2,
      fallbackCount: 1,
      turnCount: 12,
    });
    expect(variance.totalCostDeltaUsd).toBeCloseTo(21 - (plan.cost.totalUsd ?? 0));
    expect(variance.monetaryAttribution).toBe("unattributed");
    expect(variance.drivers.some((item) => item.key === "reasoning_tokens" && item.delta === 50_000)).toBe(true);
  });

  it("creates only an advisory budget/policy/gateway handoff", () => {
    const advisory = advisoryFromEstimate(DEFAULT_WORKLOAD_SCENARIO, plan, { projectId: "prj_1" });
    expect(advisory.authoritative).toBe(false);
    expect(advisory.requiresOutcomeVerification).toBe(true);
    expect(advisory.policy.enforcement).toBe("advisory_only");
    expect(advisory.gateway.autoRoute).toBe(false);
    expect(advisory.budget.scopeType).toBe("project");
  });
});
