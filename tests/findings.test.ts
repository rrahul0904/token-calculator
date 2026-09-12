import { describe, expect, it } from "vitest";
import { analyzeRun, type RunAnalysisInput } from "@/lib/findings/engine";

const baseRun = (overrides: Partial<RunAnalysisInput> = {}): RunAnalysisInput => ({
  runId: "run_test",
  status: "completed",
  totalCostUsd: 0.1,
  outcomeStatus: "success",
  turns: [],
  toolCalls: [],
  llmCalls: [],
  comparableRoutes: [],
  ...overrides,
});

function rule(input: RunAnalysisInput, id: string) {
  return analyzeRun(input).find((item) => item.ruleId === id);
}

describe("findings engine", () => {
  it("detects orientation-heavy and avoids small runs", () => {
    const turns = [0, 1, 2, 3].map((turnIndex) => ({ id: `t${turnIndex}`, turnIndex, status: "completed", freshInputTokens: turnIndex < 3 ? 10_000 : 5_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 100, costUsd: 0.1, contextTokensBefore: 1_000, contextTokensAfter: 2_000 }));
    const toolCalls = [0, 1, 2].map((i) => ({ id: `tool${i}`, turnId: `t${i}`, toolName: "read", toolCategory: "filesystem", status: "completed", isRetry: false, outputSizeBytes: 100, outputTokensEstimated: 25, resourceHash: `r${i}`, operation: "read" as const }));
    expect(rule(baseRun({ turns, toolCalls }), "orientation-heavy")?.confidence).toBe("medium");
    expect(rule(baseRun({ turns: turns.slice(0, 2), toolCalls }), "orientation-heavy")).toBeUndefined();
  });

  it("detects repeated reads but not unique resources", () => {
    const repeated = [1, 2].map((i) => ({ id: `r${i}`, turnId: null, toolName: "read", toolCategory: "filesystem", status: "completed", isRetry: false, outputSizeBytes: 400, outputTokensEstimated: 100, resourceHash: "same", operation: "read" as const }));
    expect(rule(baseRun({ toolCalls: repeated }), "repeated-resource-read")?.confidence).toBe("estimated");
    expect(rule(baseRun({ toolCalls: repeated.map((item, i) => ({ ...item, resourceHash: `u${i}` })) }), "repeated-resource-read")).toBeUndefined();
  });

  it("detects oversized tool output and ignores bounded output", () => {
    const large = { id: "large", turnId: null, toolName: "shell", toolCategory: "shell", status: "completed", isRetry: false, outputSizeBytes: 40_000, outputTokensEstimated: 10_000, resourceHash: null, operation: "execute" as const };
    expect(rule(baseRun({ toolCalls: [large] }), "oversized-tool-output")?.confidence).toBe("estimated");
    expect(rule(baseRun({ toolCalls: [{ ...large, outputTokensEstimated: 100 }] }), "oversized-tool-output")).toBeUndefined();
  });

  it("detects retry loops and ignores a single failure", () => {
    const failed = (id: string) => ({ id, turnId: null, toolName: "test", toolCategory: "shell", status: "failed", isRetry: true, outputSizeBytes: 0, outputTokensEstimated: 20, resourceHash: null, operation: "execute" as const });
    expect(rule(baseRun({ toolCalls: [failed("a"), failed("b")] }), "tool-retry-loop")?.confidence).toBe("measured");
    expect(rule(baseRun({ toolCalls: [failed("a")] }), "tool-retry-loop")).toBeUndefined();
  });

  it("detects same-resource edit churn without source content", () => {
    const edits = [0, 1, 2, 3].map((i) => ({ id: `e${i}`, turnId: `t${i}`, toolName: "edit", toolCategory: "filesystem", status: i === 1 ? "failed" : "completed", isRetry: i === 2, outputSizeBytes: 0, outputTokensEstimated: 50, resourceHash: "file_hash", operation: "edit" as const, resourceVersionBefore: i === 0 ? "v0" : `v${i}`, resourceVersionAfter: i === 3 ? "v1" : `v${i + 1}` }));
    const finding = rule(baseRun({ toolCalls: edits }), "same-resource-edit-churn");
    expect(finding?.confidence).toMatch(/measured|high/);
    expect(finding?.evidence).not.toHaveProperty("sourceContent");
    expect(finding?.evidence).not.toHaveProperty("rawContent");
    expect(JSON.stringify(finding?.evidence)).not.toContain("actual source code");
    expect(rule(baseRun({ toolCalls: edits.slice(0, 2) }), "same-resource-edit-churn")).toBeUndefined();
  });

  it("detects excessive context growth and ignores stable context", () => {
    const turns = [
      { id: "t1", turnIndex: 1, status: "completed", freshInputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, costUsd: 0, contextTokensBefore: 10_000, contextTokensAfter: 20_000 },
      { id: "t2", turnIndex: 2, status: "completed", freshInputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, costUsd: 0, contextTokensBefore: 20_000, contextTokensAfter: 90_000 },
    ];
    expect(rule(baseRun({ turns }), "excessive-context-growth")?.confidence).toBe("measured");
    const stableTurns = [
      { ...turns[0], contextTokensBefore: 10_000, contextTokensAfter: 10_100 },
      { ...turns[1], contextTokensBefore: 10_100, contextTokensAfter: 10_200 },
    ];
    expect(rule(baseRun({ turns: stableTurns }), "excessive-context-growth")).toBeUndefined();
  });

  it("detects cache blind spots and ignores healthy reuse", () => {
    const turn = { id: "t1", turnIndex: 1, status: "completed", freshInputTokens: 1_000, cacheReadTokens: 0, cacheWriteTokens: 20_000, outputTokens: 1, costUsd: 0, contextTokensBefore: null, contextTokensAfter: null };
    expect(rule(baseRun({ turns: [turn] }), "cache-blind-spot")?.confidence).toBe("measured");
    expect(rule(baseRun({ turns: [{ ...turn, cacheReadTokens: 10_000 }] }), "cache-blind-spot")).toBeUndefined();
  });

  it("detects fallback premium and ignores direct calls", () => {
    const call = { id: "c1", turnId: null, provider: "openai", modelRequested: "small", modelResolved: "large", costUsd: 2, fallbackFromCallId: "c0", attemptIndex: 1 };
    expect(rule(baseRun({ llmCalls: [call] }), "fallback-premium")?.confidence).toBe("measured");
    expect(rule(baseRun({ llmCalls: [{ ...call, fallbackFromCallId: null }] }), "fallback-premium")).toBeUndefined();
  });

  it("only emits oversized-model-route with outcome-comparable evidence", () => {
    const comparableRoutes = [
      { currentModel: "large", candidateModel: "small", workflowName: "review", sampleSize: 12, currentSuccessRate: 0.92, candidateSuccessRate: 0.92, currentMedianCostUsd: 1.2, candidateMedianCostUsd: 0.3, contextRequirementTokens: 20_000, candidateContextWindowTokens: 100_000, toolRequirementsSatisfied: true, evidenceType: "historically_observed" as const },
    ];
    const finding = rule(baseRun({ comparableRoutes }), "oversized-model-route");
    expect(finding?.confidence).toBe("high");
    expect(finding?.estimatedWasteUsd).toBeCloseTo(0.9);
    expect(rule(baseRun({ comparableRoutes: comparableRoutes.map((r) => ({ ...r, candidateSuccessRate: 0.7 })) }), "oversized-model-route")).toBeUndefined();
  });

  it("detects spend without verified outcome and ignores verified runs", () => {
    expect(rule(baseRun({ totalCostUsd: 1, outcomeStatus: null }), "spend-without-verified-outcome")?.confidence).toBe("measured");
    expect(rule(baseRun({ totalCostUsd: 1, outcomeStatus: "passed" }), "spend-without-verified-outcome")).toBeUndefined();
  });
});
