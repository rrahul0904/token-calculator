import { describe, expect, it } from "vitest";
import type { CollectorParseResult } from "@/lib/collectors/types";
import { auditCollectorResult } from "@/lib/optimization/local-usage-audit";
import { buildLocalSessionMetricReceipt } from "@/lib/optimization/local-session-metrics";
import type { TelemetryEventInput } from "@/lib/telemetry/schemas";

const timestamp = new Date("2026-09-29T12:00:00.000Z");
const tokenBuckets = {
  freshInputTokens: 10, cacheReadTokens: 2, cacheWriteTokens: 3,
  reasoningTokens: 4, outputTokens: 5,
};
function event(
  eventType: TelemetryEventInput["eventType"],
  runId: string, sourceEventId: string, payload: Record<string, unknown>,
  at = timestamp,
): TelemetryEventInput {
  return { eventType, runId, sourceEventId, source: "codex", occurredAt: at, payload };
}
function result(events: TelemetryEventInput[]): CollectorParseResult {
  return {
    collector: "codex", sessionId: "/home/user/private/session-with-secret",
    sourceFile: "/home/user/private/source.jsonl",
    usageClassification: "agent_measured", events, warnings: [],
    measuredFields: [], estimatedFields: [], missingFields: [],
  };
}

describe("RE-341 local session metric receipts", () => {
  it("retains hashed provenance, separates actual from estimated cost, and never adds run and turn usage", () => {
    const input = result([
      event("run.upsert", "run-a", "receipt?api_key=SHOULD_NOT_LEAK", {
        id: "run-a", status: "completed", usageSource: "agent_measured",
        ...tokenBuckets, actualCostUsd: 1.2, estimatedCostUsd: 0.8,
        pricingVersion: "catalog-2026-09", prompt: "RAW_SECRET_PROMPT",
        metadata: { sourceCode: "RAW_SECRET_CODE" },
      }),
      event("turn.upsert", "run-a", "turn-a", {
        id: "turn-a", runId: "run-a", usageSource: "agent_measured",
        ...tokenBuckets, costUsd: 1.2, output_text: "RAW_SECRET_OUTPUT",
      }),
      event("run.upsert", "run-b", "receipt-b", {
        id: "run-b", status: "failed", usageSource: "estimated",
        ...tokenBuckets, estimatedCostUsd: 0.45,
      }),
      event("run.upsert", "run-c", "receipt-c", {
        id: "run-c", status: "running", usageSource: "unknown",
        freshInputTokens: null, actualCostUsd: null, estimatedCostUsd: null,
      }),
    ]);
    const receipt = buildLocalSessionMetricReceipt(input);
    const runA = receipt.runs.find((run) => run.cost.measuredUsd === 1.2);
    expect(runA).toMatchObject({
      status: "completed", usage: tokenBuckets,
      usageEvidence: { source: "agent_measured", aggregation: "run_receipt" },
      cost: {
        measuredUsd: 1.2, estimatedUsd: 0.8, selectedUsd: 1.2,
        classification: "measured", basis: "agent_reported",
        pricingVersion: "catalog-2026-09",
      },
    });
    expect(runA?.usageEvidence.eventRefs).toHaveLength(1);
    expect(receipt.costs).toEqual({
      measuredUsd: 1.2, estimatedUsd: 0.45, knownPortionUsd: 1.65,
      completeTotalUsd: null, runsWithoutCost: 1, coverage: "partial",
    });
    expect(receipt.runs.find((run) => run.status === "running")?.usage.freshInputTokens).toBeNull();
    expect(receipt.privacy).toEqual({
      localOnly: true, retention: "metadata_only", rawPromptOrCodeStored: false,
      sourcePathsStored: false, automaticUpload: false, instructionPolicyActivated: false,
    });
    const serialized = JSON.stringify(receipt);
    for (const sensitive of ["RAW_SECRET_PROMPT", "RAW_SECRET_CODE", "RAW_SECRET_OUTPUT",
      "/home/user/private", "SHOULD_NOT_LEAK", "source.jsonl"]) {
      expect(serialized).not.toContain(sensitive);
    }
    expect(receipt.sessionRef).toMatch(/^session_[a-f0-9]{32}$/);
    expect(buildLocalSessionMetricReceipt(input)).toEqual(receipt);
  });

  it("deduplicates canonical source events and takes the latest value without multiplying spend", () => {
    const oldRun = event("run.upsert", "run-a", "duplicate-receipt", {
      id: "run-a", actualCostUsd: 99, usageSource: "agent_measured", ...tokenBuckets,
    });
    const latest = event("run.upsert", "run-a", "duplicate-receipt", {
      id: "run-a", actualCostUsd: 0, usageSource: "agent_measured", ...tokenBuckets,
    }, new Date("2026-09-29T12:01:00.000Z"));
    const receipt = buildLocalSessionMetricReceipt(result([oldRun, latest]));
    expect(receipt.provenance).toMatchObject({ sourceEventCount: 2, deduplicatedEventCount: 1 });
    expect(receipt.costs).toMatchObject({ measuredUsd: 0, knownPortionUsd: 0, completeTotalUsd: 0, coverage: "complete" });
  });

  it("supports turn-only receipts, preserving mixed measured/estimated cost evidence", () => {
    const receipt = buildLocalSessionMetricReceipt(result([
      event("turn.upsert", "turn-only", "first-turn", {
        id: "turn-a", usageSource: "agent_measured", ...tokenBuckets, costUsd: 0.1,
      }),
      event("turn.upsert", "turn-only", "second-turn", {
        id: "turn-b", usageSource: "estimated", ...tokenBuckets, costUsd: 0.2,
      }),
    ]));
    expect(receipt.runs[0]).toMatchObject({
      usage: {
        freshInputTokens: 20, cacheReadTokens: 4, cacheWriteTokens: 6,
        reasoningTokens: 8, outputTokens: 10,
      },
      usageEvidence: { aggregation: "turn_receipts", source: "unknown" },
      cost: { measuredUsd: 0.1, estimatedUsd: 0.2, selectedUsd: 0.3, classification: "mixed" },
    });
    expect(receipt.costs).toEqual({
      measuredUsd: 0.1, estimatedUsd: 0.2, knownPortionUsd: 0.3,
      completeTotalUsd: 0.3, runsWithoutCost: 0, coverage: "complete",
    });
  });

  it("does not convert missing turn prices or invalid numbers into a complete or zero-cost total", () => {
    const receipt = buildLocalSessionMetricReceipt(result([
      event("turn.upsert", "partial", "first", {
        id: "one", usageSource: "estimated", ...tokenBuckets, costUsd: 0.25,
      }),
      event("turn.upsert", "partial", "second", {
        id: "two", usageSource: "estimated", ...tokenBuckets, costUsd: -1,
      }),
      event("run.upsert", "unpriced", "empty", {
        id: "unpriced", estimatedCostUsd: Number.POSITIVE_INFINITY, actualCostUsd: -1,
      }),
    ]));
    const partial = receipt.runs.find((run) => run.cost.coverage === "partial");
    expect(partial?.cost).toMatchObject({
      measuredUsd: null, estimatedUsd: 0.25, selectedUsd: null,
      classification: "unknown", coverage: "partial",
    });
    expect(receipt.costs).toEqual({
      measuredUsd: null, estimatedUsd: 0.25, knownPortionUsd: 0.25,
      completeTotalUsd: null, runsWithoutCost: 2, coverage: "partial",
    });
    expect(receipt.runs.find((run) => run.cost.coverage === "none")?.cost.selectedUsd).toBeNull();
  });

  it("is emitted through the existing audit entry point, without changing the existing summary contract", () => {
    const input = result([event("run.upsert", "run-a", "one", {
      id: "run-a", status: "completed", usageSource: "estimated", ...tokenBuckets,
      estimatedCostUsd: 0.8, metadata: { prompt: "DO_NOT_EMIT" },
    })]);
    const report = auditCollectorResult(input, { generatedAt: "2026-09-29T13:00:00.000Z" });
    expect(report.summary.knownCostUsd).toBe(0.8);
    expect(report.metricReceipt.costs).toMatchObject({
      measuredUsd: null, estimatedUsd: 0.8, completeTotalUsd: 0.8,
    });
    expect(JSON.stringify(report.metricReceipt)).not.toContain("DO_NOT_EMIT");
    expect(report.metricReceipt.privacy.instructionPolicyActivated).toBe(false);
    expect(report.opportunity.additiveSavingsClaimed).toBe(false);
  });
});
