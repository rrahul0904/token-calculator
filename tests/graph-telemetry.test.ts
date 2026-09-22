import { describe, expect, it } from "vitest";
import {
  compareGraphEconomics,
  graphRunReceiptSchema,
  summarizeGraphReceipt,
} from "@/lib/graph-telemetry/schema";

function receipt() {
  return {
    schemaVersion: "1" as const,
    runId: "run_1",
    graphRunId: "graph_run_1",
    graphVersion: "v1",
    startedAt: "2026-09-22T22:00:00.000Z",
    endedAt: "2026-09-22T22:00:01.000Z",
    terminalStatus: "succeeded" as const,
    plannerTurns: 2,
    nodes: [
      {
        graphRunId: "graph_run_1",
        graphVersion: "v1",
        nodeExecutionId: "node_exec_plan",
        nodeId: "plan",
        nodeType: "planner",
        routingClass: "reasoning" as const,
        provider: "provider-a",
        model: "reasoning-model",
        usage: {
          freshInputTokens: 100,
          cacheReadTokens: 25,
          cacheWriteTokens: 0,
          reasoningTokens: 50,
          outputTokens: 20,
        },
        usageSource: "measured" as const,
        costUsd: 0.12,
        latencyMs: 600,
        retryCount: 0,
        terminalStatus: "succeeded" as const,
        dependencies: [],
        artifacts: [],
        policyDecisions: [],
      },
      {
        graphRunId: "graph_run_1",
        graphVersion: "v1",
        nodeExecutionId: "node_exec_classify",
        nodeId: "classify",
        nodeType: "decision",
        routingClass: "decision" as const,
        provider: "provider-b",
        model: "small-model",
        usage: {
          freshInputTokens: 20,
          cacheReadTokens: 10,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
          outputTokens: 2,
        },
        usageSource: "estimated" as const,
        costUsd: 0.01,
        latencyMs: 50,
        retryCount: 1,
        terminalStatus: "succeeded" as const,
        dependencies: [{ nodeExecutionId: "node_exec_plan", status: "succeeded" as const }],
        artifacts: [{ type: "classification", reference: "artifact://classify/1" }],
        policyDecisions: [{ action: "allow" as const, reason: "within graph budget" }],
      },
      {
        graphRunId: "graph_run_1",
        graphVersion: "v1",
        nodeExecutionId: "node_exec_tool",
        nodeId: "tool",
        nodeType: "shell",
        routingClass: "deterministic_tool" as const,
        usage: {
          freshInputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
          outputTokens: 0,
        },
        usageSource: "estimated" as const,
        costUsd: 0,
        latencyMs: 25,
        retryCount: 0,
        terminalStatus: "succeeded" as const,
        dependencies: [{ nodeExecutionId: "node_exec_classify", status: "succeeded" as const }],
        artifacts: [],
        policyDecisions: [],
      },
    ],
  };
}

describe("graph telemetry receipt", () => {
  it("accepts a graph receipt with explicit dependencies and routing classes", () => {
    expect(graphRunReceiptSchema.parse(receipt()).nodes).toHaveLength(3);
  });

  it("rejects duplicate execution identities", () => {
    const value = receipt();
    value.nodes[2].nodeExecutionId = "node_exec_classify";
    expect(() => graphRunReceiptSchema.parse(value)).toThrow(/unique/);
  });

  it("rejects dependencies that do not exist in the receipt", () => {
    const value = receipt();
    value.nodes[2].dependencies = [{ nodeExecutionId: "missing", status: "succeeded" as const }];
    expect(() => graphRunReceiptSchema.parse(value)).toThrow(/unknown dependency/);
  });

  it("summarizes node-level economics without treating summed node latency as wall-clock latency", () => {
    const summary = summarizeGraphReceipt(receipt());

    expect(summary.routingClassCounts).toEqual({
      reasoning: 1,
      decision: 1,
      deterministic_tool: 1,
    });
    expect(summary.totalTokens).toBe(227);
    expect(summary.totalCostUsd).toBeCloseTo(0.13, 8);
    expect(summary.measuredCostUsd).toBeCloseTo(0.12, 8);
    expect(summary.estimatedCostUsd).toBeCloseTo(0.01, 8);
    expect(summary.observedNodeLatencyMs).toBe(675);
    expect(summary.retries).toBe(1);
  });
});

describe("graph economics verification", () => {
  it("only verifies savings when outcome equivalence is explicit", () => {
    expect(
      compareGraphEconomics({
        baselineCostUsd: 1,
        candidateCostUsd: 0.6,
        outcomeEquivalent: false,
      }),
    ).toEqual({
      verified: false,
      reason: "outcome_not_equivalent",
      savingsUsd: null,
      savingsPct: null,
    });

    const verified = compareGraphEconomics({
      baselineCostUsd: 1,
      candidateCostUsd: 0.6,
      outcomeEquivalent: true,
    });

    expect(verified.verified).toBe(true);
    expect(verified.savingsUsd).toBeCloseTo(0.4, 8);
    expect(verified.savingsPct).toBeCloseTo(40, 8);
  });

  it("does not call a more expensive candidate a saving", () => {
    expect(
      compareGraphEconomics({
        baselineCostUsd: 1,
        candidateCostUsd: 1.1,
        outcomeEquivalent: true,
      }).reason,
    ).toBe("candidate_not_cheaper");
  });
});
