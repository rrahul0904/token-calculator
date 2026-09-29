import { createHash } from "node:crypto";
import type { CollectorParseResult } from "@/lib/collectors/types";
import type { TelemetryEventInput } from "@/lib/telemetry/schemas";

/**
 * RE-341: an additive, metadata-only view over canonical collector events.
 * This is not a new collector, a replacement for #3 receipts, or a bill.
 * In particular, source identifiers are hashed before leaving this view.
 */
type UsageSource = "provider_measured" | "agent_measured" | "local_tokenizer_reference" | "estimated" | "reconciled" | "unknown";
type CostBasis = "reconciled_reported" | "provider_reported" | "agent_reported" | "reported_unverified" | "pricing_estimate" | "unknown";
type TokenKey = "freshInputTokens" | "cacheReadTokens" | "cacheWriteTokens" | "reasoningTokens" | "outputTokens";
const TOKEN_KEYS: TokenKey[] = ["freshInputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens", "outputTokens"];
const USAGE_SOURCES = new Set<UsageSource>(["provider_measured", "agent_measured", "local_tokenizer_reference", "estimated", "reconciled"]);
const COST_BASIS: Record<string, CostBasis> = {
  reconciled: "reconciled_reported",
  provider_measured: "provider_reported",
  agent_measured: "agent_reported",
};
const RUN_STATUSES = new Set(["queued", "running", "completed", "failed", "aborted", "cancelled", "budget_blocked"]);

type Tokens = Record<TokenKey, number | null>;
export interface LocalRunMetricReceipt {
  runRef: string;
  status: string;
  usage: Tokens;
  usageEvidence: {
    source: UsageSource;
    aggregation: "run_receipt" | "turn_receipts" | "unavailable";
    eventRefs: string[];
  };
  cost: {
    measuredUsd: number | null;
    estimatedUsd: number | null;
    selectedUsd: number | null;
    classification: "measured" | "estimated" | "mixed" | "unknown";
    basis: CostBasis;
    pricingVersion: string | null;
    coverage: "complete" | "partial" | "none";
    eventRefs: string[];
  };
}

export interface LocalSessionMetricReceipt {
  schemaVersion: "1";
  scope: "local_session";
  collector: CollectorParseResult["collector"];
  sessionRef: string;
  provenance: {
    format: "normalized_collector_events";
    usageClassification: CollectorParseResult["usageClassification"];
    sourceEventCount: number;
    deduplicatedEventCount: number;
  };
  privacy: {
    localOnly: true;
    retention: "metadata_only";
    rawPromptOrCodeStored: false;
    sourcePathsStored: false;
    automaticUpload: false;
    instructionPolicyActivated: false;
  };
  runs: LocalRunMetricReceipt[];
  costs: {
    measuredUsd: number | null;
    estimatedUsd: number | null;
    knownPortionUsd: number | null;
    completeTotalUsd: number | null;
    runsWithoutCost: number;
    coverage: "complete" | "partial" | "none";
  };
  limitations: string[];
}

function ref(kind: string, value: string): string {
  return `${kind}_${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function safeCost(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function safeTokens(payload: Record<string, unknown>): Tokens {
  return Object.fromEntries(TOKEN_KEYS.map((key) => {
    const value = payload[key];
    return [key, typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null];
  })) as Tokens;
}
function source(value: unknown): UsageSource {
  return typeof value === "string" && USAGE_SOURCES.has(value as UsageSource) ? value as UsageSource : "unknown";
}
function version(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,80}$/.test(value) ? value : null;
}
function round(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}
function runId(event: TelemetryEventInput): string | null {
  const p = record(event.payload);
  const value = event.runId ?? p.runId ?? (event.eventType === "run.upsert" ? p.id : null);
  return typeof value === "string" && value.length > 0 ? value : null;
}
function eventRef(event: TelemetryEventInput): string {
  return ref("event", `${event.source}:${event.eventType}:${event.sourceEventId}`);
}
function selectLatest(events: TelemetryEventInput[]): TelemetryEventInput | undefined {
  return [...events].sort((a, b) =>
    b.occurredAt.getTime() - a.occurredAt.getTime() || b.sourceEventId.localeCompare(a.sourceEventId))[0];
}
function fromTurns(turns: TelemetryEventInput[]): Tokens {
  return Object.fromEntries(TOKEN_KEYS.map((key) => {
    const values = turns.map((turn) => safeTokens(record(turn.payload))[key]);
    return [key, values.length > 0 && values.every((v): v is number => v !== null)
      ? values.reduce((sum, value) => sum + value, 0) : null];
  })) as Tokens;
}
function runCost(run: TelemetryEventInput | undefined, turns: TelemetryEventInput[]) {
  const payload = record(run?.payload);
  const src = source(payload.usageSource);
  const reconciled = safeCost(payload.reconciledCostUsd);
  const actual = safeCost(payload.actualCostUsd);
  const estimate = safeCost(payload.estimatedCostUsd);
  const measured = reconciled !== null ? reconciled : actual;
  if (measured !== null) {
    // "actual" means collector/provider reported; only "reconciled" means reconciled.
    const basis: CostBasis = reconciled !== null ? "reconciled_reported" : COST_BASIS[src] ?? "reported_unverified";
    return {
      measuredUsd: measured, estimatedUsd: estimate, selectedUsd: measured,
      classification: "measured" as const, basis, pricingVersion: version(payload.pricingVersion),
      coverage: "complete" as const, eventRefs: run ? [eventRef(run)] : [],
    };
  }
  if (estimate !== null) {
    return {
      measuredUsd: null, estimatedUsd: estimate, selectedUsd: estimate,
      classification: "estimated" as const, basis: "pricing_estimate" as const,
      pricingVersion: version(payload.pricingVersion), coverage: "complete" as const,
      eventRefs: run ? [eventRef(run)] : [],
    };
  }
  // Turn amounts are *not* added to a run amount; partial turns never become a full run total.
  const priced = turns.filter((turn) => safeCost(record(turn.payload).costUsd) !== null);
  if (!priced.length) {
    return {
      measuredUsd: null, estimatedUsd: null, selectedUsd: null,
      classification: "unknown" as const, basis: "unknown" as const, pricingVersion: null,
      coverage: "none" as const, eventRefs: [],
    };
  }
  const complete = priced.length === turns.length;
  const reported = priced.filter((turn) => {
    const s = source(record(turn.payload).usageSource);
    return s === "provider_measured" || s === "agent_measured" || s === "reconciled";
  });
  const estimated = priced.filter((turn) => !reported.includes(turn));
  const sumPriced = (items: TelemetryEventInput[]) => items.length
    ? round(items.reduce((sum, turn) => sum + (safeCost(record(turn.payload).costUsd) ?? 0), 0)) : null;
  const measuredUsd = sumPriced(reported);
  const estimatedUsd = sumPriced(estimated);
  return {
    measuredUsd, estimatedUsd,
    selectedUsd: complete ? round((measuredUsd ?? 0) + (estimatedUsd ?? 0)) : null,
    classification: !complete ? "unknown" as const : reported.length && estimated.length
      ? "mixed" as const : estimated.length ? "estimated" as const : "measured" as const,
    basis: !complete || (reported.length && estimated.length) ? "unknown" as const
      : estimated.length ? "pricing_estimate" as const : "agent_reported" as const,
    pricingVersion: null, coverage: complete ? "complete" as const : "partial" as const,
    eventRefs: priced.map(eventRef).sort(),
  };
}

export function buildLocalSessionMetricReceipt(input: CollectorParseResult): LocalSessionMetricReceipt {
  // Duplicate logical events never create extra spend; scan #19 already merges sessions across files.
  const events = new Map<string, TelemetryEventInput>();
  for (const event of input.events) {
    const key = `${event.source}:${event.eventType}:${event.sourceEventId}`;
    const previous = events.get(key);
    if (!previous || event.occurredAt.getTime() >= previous.occurredAt.getTime()) events.set(key, event);
  }
  const byRun = new Map<string, TelemetryEventInput[]>();
  for (const event of events.values()) {
    const id = runId(event);
    if (!id) continue;
    byRun.set(id, [...(byRun.get(id) ?? []), event]);
  }
  const runs = [...byRun.entries()].map(([id, group]): LocalRunMetricReceipt => {
    const run = selectLatest(group.filter((item) => item.eventType === "run.upsert"));
    const turns = group.filter((item) => item.eventType === "turn.upsert");
    // A present run receipt is authoritative even when a bucket is missing: don't mix snapshots.
    const usage = run ? safeTokens(record(run.payload)) : fromTurns(turns);
    const usageEvents = run ? [run] : turns;
    const cost = runCost(run, turns);
    const value = record(run?.payload).status;
    return {
      runRef: ref("run", `${input.collector}:${input.sessionId}:${id}`),
      status: typeof value === "string" && RUN_STATUSES.has(value) ? value : "unknown",
      usage,
      usageEvidence: {
        source: run ? source(record(run.payload).usageSource) : turns.length && turns.every((turn) => source(record(turn.payload).usageSource) === "agent_measured") ? "agent_measured" : "unknown",
        aggregation: run ? "run_receipt" : turns.length ? "turn_receipts" : "unavailable",
        eventRefs: usageEvents.map(eventRef).sort(),
      },
      cost,
    };
  }).sort((a, b) => a.runRef.localeCompare(b.runRef));

  // For a run with both an actual and a counterfactual estimate, only the actual
  // is included in session totals. Mixed turn receipts may contribute both buckets.
  const amounts = (kind: "measuredUsd" | "estimatedUsd"): number[] => runs.flatMap((run) => {
    if (kind === "estimatedUsd" && run.cost.classification === "measured") return [];
    const amount = run.cost[kind];
    return amount === null ? [] : [amount];
  });
  const sum = (values: number[]): number | null => values.length
    ? round(values.reduce((total, amount) => total + amount, 0)) : null;
  const measured = sum(amounts("measuredUsd"));
  const estimated = sum(amounts("estimatedUsd"));
  const known = measured === null && estimated === null ? null : round((measured ?? 0) + (estimated ?? 0));
  const fullyPriced = runs.filter((run) => run.cost.coverage === "complete").length;
  const coverage = known === null ? "none" : fullyPriced === runs.length ? "complete" : "partial";
  return {
    schemaVersion: "1",
    scope: "local_session",
    collector: input.collector,
    sessionRef: ref("session", `${input.collector}:${input.sessionId}`),
    provenance: {
      format: "normalized_collector_events",
      usageClassification: input.usageClassification,
      sourceEventCount: input.events.length,
      deduplicatedEventCount: events.size,
    },
    privacy: {
      localOnly: true, retention: "metadata_only", rawPromptOrCodeStored: false,
      sourcePathsStored: false, automaticUpload: false, instructionPolicyActivated: false,
    },
    runs,
    costs: {
      measuredUsd: measured, estimatedUsd: estimated, knownPortionUsd: known,
      completeTotalUsd: coverage === "complete" ? known : null,
      runsWithoutCost: runs.length - fullyPriced, coverage,
    },
    limitations: [
      "Collector-observed token counts are not independently verified provider billing.",
      "Measured and estimated USD are separate; unknown or partially priced runs prevent a complete session total.",
      "No outcome equivalence, savings, benchmark reproduction, or instruction-policy activation is inferred.",
    ],
  };
}
