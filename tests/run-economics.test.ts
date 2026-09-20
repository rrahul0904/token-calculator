import { describe, expect, it } from "vitest";
import { resolveExperimentEconomics } from "@/lib/evaluations/run-economics";

describe("experiment run economics", () => {
  it("uses reconciled linked-run economics instead of caller supplied values", () => {
    const result = resolveExperimentEconomics({
      run: {
        reconciledCostUsd: "0.42000000",
        usageSource: "provider_measured",
        freshInputTokens: 100,
        cacheReadTokens: 20,
        cacheWriteTokens: 10,
        reasoningTokens: 30,
        outputTokens: 40,
        retryCount: 2,
        fallbackCount: 1,
      },
      submitted: { costUsd: 99, tokens: 99, retries: 99, fallbacks: 99 },
    });

    // 100 fresh + 20 cache read + 10 cache write + 40 output. The 30
    // reasoning tokens are already represented within provider output usage.
    expect(result).toEqual({
      costUsd: 0.42,
      tokens: 170,
      retries: 2,
      fallbacks: 1,
      source: "linked_run",
    });
  });

  it("fails closed on cost when the linked run is not authoritative", () => {
    const result = resolveExperimentEconomics({
      run: {
        reconciledCostUsd: "0.42",
        usageSource: "estimated",
        freshInputTokens: 100,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        outputTokens: 20,
        retryCount: 0,
        fallbackCount: 0,
      },
      submitted: { costUsd: 0.01, tokens: 1, retries: 0, fallbacks: 0 },
    });

    expect(result.costUsd).toBeNull();
    expect(result.tokens).toBeNull();
    expect(result.source).toBe("linked_run");
  });

  it("preserves submitted economics only when no run is linked", () => {
    expect(resolveExperimentEconomics({
      submitted: { costUsd: 1.25, tokens: 500, retries: 1, fallbacks: 0 },
    })).toEqual({
      costUsd: 1.25,
      tokens: 500,
      retries: 1,
      fallbacks: 0,
      source: "submitted",
    });
  });
});
