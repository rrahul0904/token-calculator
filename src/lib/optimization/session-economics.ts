import { createHash } from "node:crypto";
import type { CollectorParseResult } from "@/lib/collectors/types";
import { buildLocalSessionMetricReceipt } from "@/lib/optimization/local-session-metrics";
import type { TelemetryEventInput } from "@/lib/telemetry/schemas";

export interface SessionEconomicsOptions {
  idleGapThresholdMs?: number;
}

export interface SessionTurnEconomics {
  turnRef: string;
  turnIndex: number | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  totalTokens: number;
  costUsd: number | null;
  costClassification: "reported" | "estimated" | "unknown";
}

export interface SessionEconomicsReport {
  version: 1;
  collector: CollectorParseResult["collector"];
  sessionRef: string;
  activity: {
    firstObservedAt: string | null;
    lastObservedAt: string | null;
    elapsedDurationMs: number;
    activeDurationMs: number;
    excludedIdleMs: number;
    idleGapThresholdMs: number;
    activityPointCount: number;
  };
  usage: {
    runs: number;
    turns: number;
    llmCalls: number;
    toolCalls: number;
    totalTokens: number;
  };
  cost: {
    measuredUsd: number | null;
    estimatedUsd: number | null;
    knownPortionUsd: number | null;
    completeTotalUsd: number | null;
    coverage: "complete" | "partial" | "none";
  };
  turns: SessionTurnEconomics[];
  subscriptionWindowSharePct: null;
  privacy: {
    localOnly: true;
    metadataOnly: true;
    promptContentStored: false;
    codeContentStored: false;
    sourcePathsStored: false;
  };
  limitations: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function countValue(value: unknown): number {
  const valueNumber = numberValue(value);
  return valueNumber === null ? 0 : Math.max(0, Math.trunc(valueNumber));
}

function dateValue(value: unknown): Date | null {
  if (!(typeof value === "string" || value instanceof Date)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function ref(kind: string, value: string): string {
  return `${kind}_${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

function totalTokens(payload: Record<string, unknown>): number {
  return countValue(payload.freshInputTokens)
    + countValue(payload.cacheReadTokens)
    + countValue(payload.cacheWriteTokens)
    + countValue(payload.reasoningTokens)
    + countValue(payload.outputTokens);
}

function costClassification(payload: Record<string, unknown>): "reported" | "estimated" | "unknown" {
  if (numberValue(payload.costUsd) === null) return "unknown";
  const source = typeof payload.usageSource === "string" ? payload.usageSource : "unknown";
  if (["provider_measured", "agent_measured", "reconciled"].includes(source)) return "reported";
  return "estimated";
}

function collectActivityPoints(events: TelemetryEventInput[]): Date[] {
  const values: number[] = [];
  for (const event of events) {
    values.push(event.occurredAt.getTime());
    const payload = asRecord(event.payload);
    const startedAt = dateValue(payload.startedAt);
    const endedAt = dateValue(payload.endedAt);
    if (startedAt) values.push(startedAt.getTime());
    if (endedAt) values.push(endedAt.getTime());
  }
  return [...new Set(values)].sort((a, b) => a - b).map((value) => new Date(value));
}

function activityDurations(points: Date[], idleGapThresholdMs: number) {
  if (points.length < 2) return { elapsedDurationMs: 0, activeDurationMs: 0, excludedIdleMs: 0 };
  let activeDurationMs = 0;
  let excludedIdleMs = 0;
  for (let index = 1; index < points.length; index += 1) {
    const gap = Math.max(0, points[index].getTime() - points[index - 1].getTime());
    if (gap > idleGapThresholdMs) excludedIdleMs += gap;
    else activeDurationMs += gap;
  }
  return {
    elapsedDurationMs: Math.max(0, points[points.length - 1].getTime() - points[0].getTime()),
    activeDurationMs,
    excludedIdleMs,
  };
}

function turnEconomics(event: TelemetryEventInput, sessionId: string): SessionTurnEconomics | null {
  if (event.eventType !== "turn.upsert") return null;
  const payload = asRecord(event.payload);
  const turnId = typeof payload.id === "string" && payload.id.length ? payload.id : event.sourceEventId;
  const startedAt = dateValue(payload.startedAt);
  const endedAt = dateValue(payload.endedAt);
  const costUsd = numberValue(payload.costUsd);
  return {
    turnRef: ref("turn", `${sessionId}:${turnId}`),
    turnIndex: numberValue(payload.turnIndex) === null ? null : countValue(payload.turnIndex),
    startedAt: startedAt?.toISOString() ?? null,
    endedAt: endedAt?.toISOString() ?? null,
    durationMs: startedAt && endedAt ? Math.max(0, endedAt.getTime() - startedAt.getTime()) : null,
    totalTokens: totalTokens(payload),
    costUsd: costUsd === null || costUsd < 0 ? null : costUsd,
    costClassification: costClassification(payload),
  };
}

export function buildSessionEconomicsReport(input: CollectorParseResult, options: SessionEconomicsOptions = {}): SessionEconomicsReport {
  const idleGapThresholdMs = options.idleGapThresholdMs ?? 15 * 60_000;
  if (!Number.isFinite(idleGapThresholdMs) || idleGapThresholdMs < 0) throw new Error("idleGapThresholdMs must be a finite non-negative number");
  const events = [...input.events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.sourceEventId.localeCompare(b.sourceEventId));
  const metricReceipt = buildLocalSessionMetricReceipt(input);
  const points = collectActivityPoints(events);
  const activity = activityDurations(points, idleGapThresholdMs);
  const turns = events.map((event) => turnEconomics(event, input.sessionId)).filter((value): value is SessionTurnEconomics => value !== null)
    .sort((a, b) => (a.turnIndex ?? Number.MAX_SAFE_INTEGER) - (b.turnIndex ?? Number.MAX_SAFE_INTEGER) || (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
  const runEvents = events.filter((event) => event.eventType === "run.upsert");
  const llmCalls = events.filter((event) => event.eventType === "llm_call.recorded").length;
  const toolCalls = events.filter((event) => event.eventType === "tool_call.recorded").length;
  const usageRuns = metricReceipt.runs;
  const usageTotal = usageRuns.reduce((sum, run) => sum
    + (run.usage.freshInputTokens ?? 0)
    + (run.usage.cacheReadTokens ?? 0)
    + (run.usage.cacheWriteTokens ?? 0)
    + (run.usage.reasoningTokens ?? 0)
    + (run.usage.outputTokens ?? 0), 0);

  return {
    version: 1,
    collector: input.collector,
    sessionRef: metricReceipt.sessionRef,
    activity: {
      firstObservedAt: points[0]?.toISOString() ?? null,
      lastObservedAt: points[points.length - 1]?.toISOString() ?? null,
      elapsedDurationMs: activity.elapsedDurationMs,
      activeDurationMs: activity.activeDurationMs,
      excludedIdleMs: activity.excludedIdleMs,
      idleGapThresholdMs,
      activityPointCount: points.length,
    },
    usage: {
      runs: runEvents.length || metricReceipt.runs.length,
      turns: turns.length,
      llmCalls,
      toolCalls,
      totalTokens: usageTotal,
    },
    cost: {
      measuredUsd: metricReceipt.costs.measuredUsd,
      estimatedUsd: metricReceipt.costs.estimatedUsd,
      knownPortionUsd: metricReceipt.costs.knownPortionUsd,
      completeTotalUsd: metricReceipt.costs.completeTotalUsd,
      coverage: metricReceipt.costs.coverage,
    },
    turns,
    subscriptionWindowSharePct: null,
    privacy: {
      localOnly: true,
      metadataOnly: true,
      promptContentStored: false,
      codeContentStored: false,
      sourcePathsStored: false,
    },
    limitations: [
      "Active duration is reconstructed from normalized metadata timestamps. Gaps longer than the configured idle threshold are excluded rather than attributed to work.",
      "Known-cost coverage follows the existing local-session metric receipt; partial or missing costs are never converted to zero.",
      "Turn costs are descriptive local observations and are not summed over an authoritative session total when the canonical session receipt says coverage is incomplete.",
      "Subscription-window share is intentionally unknown unless a provider/account meter with compatible timestamps is independently available.",
      "No prompt, response, code, tool payload, or source path is retained in this report.",
    ],
  };
}

export function rankSessionEconomics(reports: SessionEconomicsReport[], top = 10): SessionEconomicsReport[] {
  const limit = Number.isFinite(top) ? Math.max(1, Math.trunc(top)) : 10;
  return [...reports].sort((a, b) => {
    const aCost = a.cost.completeTotalUsd ?? a.cost.knownPortionUsd ?? -1;
    const bCost = b.cost.completeTotalUsd ?? b.cost.knownPortionUsd ?? -1;
    return bCost - aCost || b.usage.totalTokens - a.usage.totalTokens || a.sessionRef.localeCompare(b.sessionRef);
  }).slice(0, limit);
}

function money(value: number | null): string {
  return value === null ? "unknown" : `$${value.toFixed(4)}`;
}

export function formatSessionEconomicsReport(report: SessionEconomicsReport): string {
  const lines = [
    "Token Intelligence session economics",
    `Session: ${report.sessionRef}`,
    `Collector: ${report.collector}`,
    `Active duration: ${Math.round(report.activity.activeDurationMs / 1_000).toLocaleString()}s`,
    `Excluded idle: ${Math.round(report.activity.excludedIdleMs / 1_000).toLocaleString()}s`,
    `Usage: ${report.usage.turns.toLocaleString()} turns, ${report.usage.llmCalls.toLocaleString()} LLM calls, ${report.usage.totalTokens.toLocaleString()} tokens`,
    `Known cost: ${money(report.cost.knownPortionUsd)} (${report.cost.coverage} coverage)`,
    "Subscription-window share: unknown without provider meter evidence.",
  ];
  return `${lines.join("\n")}\n`;
}
