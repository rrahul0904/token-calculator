import { describe, expect, it } from "vitest";
import { composeRestrictiveRules, evaluatePolicies, type EvaluatedPolicy } from "@/lib/policy/engine";

const policy = (id: string, rules: EvaluatedPolicy["rules"], priority = 10): EvaluatedPolicy => ({
  id,
  name: id,
  priority,
  scopeType: "project",
  rules,
});

const baseline = {
  observedCostUsd: 1,
  projectedNextCallCostUsd: 0.25,
  tokens: 1000,
  turns: 2,
  retries: 0,
  failedToolCalls: 0,
  toolCalls: 3,
};

describe("policy evaluation", () => {
  it("kills a run that reaches a hard spend cap", () => {
    const result = evaluatePolicies([policy("hard", { maxCostUsd: 1 })], baseline);
    expect(result.action).toBe("KILL_RUN");
    expect(result.policyIds).toContain("hard");
  });

  it("blocks the next call when its projection would cross the cap", () => {
    const result = evaluatePolicies(
      [policy("hard", { maxCostUsd: 1.2 })],
      { ...baseline, observedCostUsd: 1.1, projectedNextCallCostUsd: 0.2 },
    );
    expect(result.action).toBe("BLOCK_NEXT_CALL");
  });

  it("requires approval for a costly fallback unless a stronger rule blocks it", () => {
    const approval = evaluatePolicies(
      [policy("fallback", { fallbackPremiumApprovalUsd: 0.5 })],
      { ...baseline, isFallback: true, fallbackPremiumUsd: 0.75 },
    );
    expect(approval.action).toBe("REQUIRE_APPROVAL");

    const blocked = evaluatePolicies(
      [policy("fallback", { fallbackPremiumApprovalUsd: 0.5 }), policy("models", { allowedModels: ["cheap"] })],
      { ...baseline, model: "expensive", isFallback: true, fallbackPremiumUsd: 0.75 },
    );
    expect(blocked.action).toBe("BLOCK_NEXT_CALL");
  });

  it("uses the strongest action while retaining all constraints", () => {
    const result = evaluatePolicies(
      [policy("warn", { warnCostUsd: 0.5 }), policy("provider", { allowedProviders: ["OpenAI"] })],
      { ...baseline, provider: "Anthropic" },
    );
    expect(result.action).toBe("BLOCK_NEXT_CALL");
    expect(result.constraints).toEqual(expect.arrayContaining(["warnCostUsd", "allowedProviders"]));
  });
});

describe("restrictive policy composition", () => {
  it("takes the lowest hard limits and intersections of allowlists", () => {
    const result = composeRestrictiveRules([
      policy("org", { maxCostUsd: 10, maxRetries: 4, allowedProviders: ["OpenAI", "Anthropic"], allowedModels: ["a", "b"] }),
      policy("project", { maxCostUsd: 5, maxRetries: 2, allowedProviders: ["Anthropic", "Google"], allowedModels: ["b", "c"], disableFallback: true }),
    ]);
    expect(result.maxCostUsd).toBe(5);
    expect(result.maxRetries).toBe(2);
    expect(result.allowedProviders).toEqual(["Anthropic"]);
    expect(result.allowedModels).toEqual(["b"]);
    expect(result.disableFallback).toBe(true);
  });
});
