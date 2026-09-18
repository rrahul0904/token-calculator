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
  elapsedMs: 1_000,
  providerRounds: 1,
  resultBytes: 2_048,
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

  it("kills runs that reach hard runtime ceilings", () => {
    expect(evaluatePolicies([policy("time", { maxElapsedMs: 1_000 })], baseline)).toMatchObject({ action: "KILL_RUN", constraints: ["maxElapsedMs"] });
    expect(evaluatePolicies([policy("rounds", { maxProviderRounds: 1 })], baseline)).toMatchObject({ action: "KILL_RUN", constraints: ["maxProviderRounds"] });
    expect(evaluatePolicies([policy("bytes", { maxResultBytes: 2_048 })], baseline)).toMatchObject({ action: "KILL_RUN", constraints: ["maxResultBytes"] });
  });

  it("allows runtime state while it remains below every ceiling", () => {
    const result = evaluatePolicies([
      policy("runtime", { maxElapsedMs: 2_000, maxProviderRounds: 2, maxResultBytes: 4_096 }),
    ], baseline);
    expect(result.action).toBe("ALLOW");
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
      policy("org", { maxCostUsd: 10, maxRetries: 4, maxElapsedMs: 60_000, maxProviderRounds: 8, maxResultBytes: 2_000_000, allowedProviders: ["OpenAI", "Anthropic"], allowedModels: ["a", "b"] }),
      policy("project", { maxCostUsd: 5, maxRetries: 2, maxElapsedMs: 30_000, maxProviderRounds: 4, maxResultBytes: 1_000_000, allowedProviders: ["Anthropic", "Google"], allowedModels: ["b", "c"], disableFallback: true }),
    ]);
    expect(result.maxCostUsd).toBe(5);
    expect(result.maxRetries).toBe(2);
    expect(result.maxElapsedMs).toBe(30_000);
    expect(result.maxProviderRounds).toBe(4);
    expect(result.maxResultBytes).toBe(1_000_000);
    expect(result.allowedProviders).toEqual(["Anthropic"]);
    expect(result.allowedModels).toEqual(["b"]);
    expect(result.disableFallback).toBe(true);
  });
});
