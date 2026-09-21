import { describe, expect, it } from "vitest";
import {
  resolveExperimentEconomics,
  resolveOrchestrationExperimentEconomics,
} from "@/lib/evaluations/run-economics";

function linkedRun(overrides: Partial<Parameters<typeof resolveExperimentEconomics>[0]["run"] extends infer T ? NonNullable<T> : never> = {}) {
  return {
    reconciledCostUsd: "0.42000000",
    actualCostUsd: "0.42000000",
    usageSource: "provider_measured",
    agentVendor: "openai",
    freshInputTokens: 100,
    cacheReadTokens: 20,
    cacheWriteTokens: 10,
    reasoningTokens: 30,
    outputTokens: 40,
    retryCount: 2,
    fallbackCount: 1,
    ...overrides,
  };
}

describe("experiment run economics", () => {
  it("uses authoritative linked-run economics instead of caller supplied values", () => {
    const result = resolveExperimentEconomics({
      run: linkedRun(),
      submitted: { costUsd: 99, tokens: 99, retries: 99, fallbacks: 99 },
    });

    // OpenAI reasoning tokens are already represented within provider output usage.
    expect(result).toEqual({
      costUsd: 0.42,
      tokens: 170,
      retries: 2,
      fallbacks: 1,
      source: "linked_run",
    });
  });

  it("preserves provider-measured actual cost when no reconciled cost is present", () => {
    const result = resolveExperimentEconomics({
      run: linkedRun({ reconciledCostUsd: null, actualCostUsd: "0.37" }),
      submitted: { costUsd: 99, tokens: 99, retries: 99, fallbacks: 99 },
    });

    expect(result.costUsd).toBe(0.37);
    expect(result.source).toBe("linked_run");
  });

  it("includes separately reported Gemini reasoning tokens", () => {
    const result = resolveExperimentEconomics({
      run: linkedRun({
        agentVendor: "gemini",
        freshInputTokens: 100,
        cacheReadTokens: 20,
        cacheWriteTokens: 0,
        reasoningTokens: 30,
        outputTokens: 40,
      }),
      submitted: { costUsd: 99, tokens: 99, retries: 99, fallbacks: 99 },
    });

    expect(result.tokens).toBe(190);
  });

  it("fails closed on cost when the linked run is not authoritative", () => {
    const result = resolveExperimentEconomics({
      run: linkedRun({
        reconciledCostUsd: "0.42",
        actualCostUsd: "0.42",
        usageSource: "estimated",
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        outputTokens: 20,
        retryCount: 0,
        fallbackCount: 0,
      }),
      submitted: { costUsd: 0.01, tokens: 1, retries: 0, fallbacks: 0 },
    });

    expect(result.costUsd).toBeNull();
    expect(result.tokens).toBeNull();
    expect(result.source).toBe("linked_run");
  });

  it("aggregates every orchestration phase from authoritative call receipts", () => {
    const result = resolveOrchestrationExperimentEconomics({
      calls: [
        {
          provider: "openai",
          costUsd: "0.40",
          costSource: "reconciled",
          freshInputTokens: 100,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: 20,
          outputTokens: 50,
        },
        {
          provider: "gemini",
          costUsd: "0.10",
          costSource: "provider_measured",
          freshInputTokens: 40,
          cacheReadTokens: 10,
          cacheWriteTokens: 0,
          reasoningTokens: 15,
          outputTokens: 20,
        },
        {
          provider: "anthropic",
          costUsd: "0.30",
          costSource: "reconciled",
          freshInputTokens: 60,
          cacheReadTokens: 0,
          cacheWriteTokens: 5,
          reasoningTokens: 10,
          outputTokens: 30,
        },
      ],
      retries: 2,
      fallbacks: 1,
    });

    expect(result).toEqual({
      costUsd: 0.8,
      tokens: 330,
      retries: 2,
      fallbacks: 1,
      source: "orchestration_calls",
    });
  });

  it("fails orchestration cost closed when any phase lacks authoritative cost evidence", () => {
    const result = resolveOrchestrationExperimentEconomics({
      calls: [
        {
          provider: "openai",
          costUsd: "0.40",
          costSource: "reconciled",
          freshInputTokens: 100,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: 20,
          outputTokens: 50,
        },
        {
          provider: "openai",
          costUsd: null,
          costSource: "unknown",
          freshInputTokens: 10,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
          outputTokens: 5,
        },
      ],
      retries: 1,
      fallbacks: 0,
    });

    expect(result.costUsd).toBeNull();
    expect(result.tokens).toBeNull();
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
