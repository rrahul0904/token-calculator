import { describe, expect, it } from "vitest";
import type { CollectorParseResult } from "@/lib/collectors/types";
import { buildSessionEconomicsReport, rankSessionEconomics } from "@/lib/optimization/session-economics";

function fixture(sessionId = "session-a", totalCost = 1.5): CollectorParseResult {
  return {
    collector: "claude",
    sessionId,
    usageClassification: "agent_measured",
    events: [
      {
        sourceEventId: `${sessionId}:turn-1`,
        source: "claude",
        eventType: "turn.upsert",
        occurredAt: new Date("2026-10-01T12:01:00.000Z"),
        projectId: "project-a",
        runId: `${sessionId}-run`,
        payload: {
          id: `${sessionId}-turn-1`,
          runId: `${sessionId}-run`,
          turnIndex: 0,
          startedAt: new Date("2026-10-01T12:00:00.000Z"),
          endedAt: new Date("2026-10-01T12:01:00.000Z"),
          status: "completed",
          freshInputTokens: 300,
          cacheReadTokens: 500,
          cacheWriteTokens: 0,
          reasoningTokens: 50,
          outputTokens: 100,
          costUsd: 0.5,
          usageSource: "agent_measured",
          metadata: { rawPrompt: "top-secret-do-not-retain" },
        },
      },
      {
        sourceEventId: `${sessionId}:turn-2`,
        source: "claude",
        eventType: "turn.upsert",
        occurredAt: new Date("2026-10-01T12:32:00.000Z"),
        projectId: "project-a",
        runId: `${sessionId}-run`,
        payload: {
          id: `${sessionId}-turn-2`,
          runId: `${sessionId}-run`,
          turnIndex: 1,
          startedAt: new Date("2026-10-01T12:31:00.000Z"),
          endedAt: new Date("2026-10-01T12:32:00.000Z"),
          status: "completed",
          freshInputTokens: 300,
          cacheReadTokens: 500,
          cacheWriteTokens: 0,
          reasoningTokens: 50,
          outputTokens: 100,
          costUsd: 0.4,
          usageSource: "estimated",
          metadata: {},
        },
      },
      {
        sourceEventId: `${sessionId}:llm-1`,
        source: "claude",
        eventType: "llm_call.recorded",
        occurredAt: new Date("2026-10-01T12:00:30.000Z"),
        projectId: "project-a",
        runId: `${sessionId}-run`,
        payload: { id: `${sessionId}-llm-1`, runId: `${sessionId}-run`, provider: "Anthropic" },
      },
      {
        sourceEventId: `${sessionId}:tool-1`,
        source: "claude",
        eventType: "tool_call.recorded",
        occurredAt: new Date("2026-10-01T12:31:30.000Z"),
        projectId: "project-a",
        runId: `${sessionId}-run`,
        payload: { id: `${sessionId}-tool-1`, runId: `${sessionId}-run`, toolName: "Read", status: "completed" },
      },
      {
        sourceEventId: `${sessionId}:run`,
        source: "claude",
        eventType: "run.upsert",
        occurredAt: new Date("2026-10-01T13:00:00.000Z"),
        projectId: "project-a",
        runId: `${sessionId}-run`,
        payload: {
          id: `${sessionId}-run`,
          startedAt: new Date("2026-10-01T12:00:00.000Z"),
          endedAt: new Date("2026-10-01T13:00:00.000Z"),
          status: "completed",
          actualCostUsd: totalCost,
          freshInputTokens: 1_000,
          cacheReadTokens: 2_000,
          cacheWriteTokens: 0,
          reasoningTokens: 100,
          outputTokens: 500,
          usageSource: "agent_measured",
          metadata: {},
        },
      },
    ],
    warnings: [],
    measuredFields: ["tokens", "cost"],
    estimatedFields: [],
    missingFields: [],
  };
}

describe("session economics", () => {
  it("excludes long idle gaps while preserving elapsed duration", () => {
    const report = buildSessionEconomicsReport(fixture(), { idleGapThresholdMs: 15 * 60_000 });
    expect(report.activity.elapsedDurationMs).toBe(60 * 60_000);
    expect(report.activity.activeDurationMs).toBe(2 * 60_000);
    expect(report.activity.excludedIdleMs).toBe(58 * 60_000);
  });

  it("reuses canonical session cost coverage instead of summing turn costs into a competing ledger", () => {
    const report = buildSessionEconomicsReport(fixture());
    expect(report.cost).toMatchObject({
      measuredUsd: 1.5,
      knownPortionUsd: 1.5,
      completeTotalUsd: 1.5,
      coverage: "complete",
    });
    expect(report.turns.map((turn) => turn.costClassification)).toEqual(["reported", "estimated"]);
    expect(report.usage.totalTokens).toBe(3_600);
  });

  it("keeps provider subscription-window share unknown without meter evidence and drops raw content", () => {
    const report = buildSessionEconomicsReport(fixture());
    expect(report.subscriptionWindowSharePct).toBeNull();
    expect(report.privacy.metadataOnly).toBe(true);
    expect(JSON.stringify(report)).not.toContain("top-secret-do-not-retain");
  });

  it("ranks costliest sessions by canonical known cost", () => {
    const cheaper = buildSessionEconomicsReport(fixture("session-cheap", 1.25));
    const expensive = buildSessionEconomicsReport(fixture("session-expensive", 3.5));
    expect(rankSessionEconomics([cheaper, expensive], 1)[0].cost.completeTotalUsd).toBe(3.5);
  });
});
