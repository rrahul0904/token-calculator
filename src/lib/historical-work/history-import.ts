import * as z from "zod";
import { createHash } from "node:crypto";
import { historicalWorkInputSchema, sanitizeHistoricalModelRef, type HistoricalWorkInput } from "./reconstruction";
import type { HistoricalWorkReconstruction } from "./reconstruction";

const eventSchema = z.object({
  type: z.literal("turn"),
  eventId: z.string().min(1).max(240),
  occurredAt: z.string().datetime({ offset: true }).nullable(),
  modelRef: z.string().min(1).max(200).nullable(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative().nullable(),
    cacheReadTokens: z.number().int().nonnegative().nullable(),
    cacheWriteTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
  }).strict(),
  reportedCostUsd: z.number().finite().nonnegative().nullable().default(null),
  estimatedCostUsd: z.number().finite().nonnegative().nullable().default(null),
  boundaryHint: z.enum(["none", "compaction", "explicit"]).default("none"),
}).strict();

export interface HistoryImportOptions {
  sourceRef: string;
  projectRef: string;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function parseJsonLines(text: string): JsonRecord[] {
  const records: JsonRecord[] = [];
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`Invalid history JSON on line ${index + 1}`);
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Invalid history record on line ${index + 1}`);
    }
    records.push(value as JsonRecord);
  }
  return records;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function opaque(kind: string, value: string): string {
  return `${kind}_${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

function safeOptions(options: HistoryImportOptions): HistoryImportOptions {
  return {
    sourceRef: opaque("source", options.sourceRef),
    projectRef: opaque("project", options.projectRef),
  };
}

function safeEventRef(adapter: string, eventId: string): string {
  return opaque("event", `${adapter}:${eventId}`);
}

/** Imports the content-free `token-intelligence-history-v1` JSONL interchange format. */
export function importHistoricalWorkJsonl(text: string, options: HistoryImportOptions): HistoricalWorkInput {
  const lines = text.split(/\r?\n/);
  const turns: HistoricalWorkInput["turns"] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`Invalid history JSON on line ${index + 1}`);
    }
    const event = eventSchema.parse(value);
    const eventRef = safeEventRef("token-intelligence-history-v1", event.eventId);
    turns.push({
      sourceRef: eventRef,
      occurredAt: event.occurredAt,
      modelRef: sanitizeHistoricalModelRef(event.modelRef),
      usage: event.usage,
      reportedCostUsd: event.reportedCostUsd,
      estimatedCostUsd: event.estimatedCostUsd,
      boundaryHint: event.boundaryHint,
      provenance: { adapter: "token-intelligence-history-v1", sourceEventRef: eventRef },
    });
  }
  return historicalWorkInputSchema.parse({ schemaVersion: "1", ...safeOptions(options), turns });
}

/** Imports usage events from Codex session JSONL without returning message or file content. */
export function importCodexSessionJsonl(text: string, options: HistoryImportOptions): HistoricalWorkInput {
  const turns: HistoricalWorkInput["turns"] = [];
  let modelRef: string | null = null;
  let turnId: string | null = null;
  let pendingCompaction = false;
  let previousTotals: Record<string, number | null> | null = null;
  const seenTokenEvents = new Set<string>();

  for (const record of parseJsonLines(text)) {
    const payload = asRecord(record.payload);
    const type = record.type;
    if (type === "turn_context") {
      modelRef = typeof payload.model === "string" ? payload.model : modelRef;
      turnId = typeof payload.turn_id === "string" ? payload.turn_id : turnId;
      continue;
    }
    if (type === "event_msg" && ["compaction", "context_compacted", "context_compaction"].includes(String(payload.type))) {
      pendingCompaction = true;
      continue;
    }
    if (type !== "event_msg" || payload.type !== "token_count") continue;

    const info = asRecord(payload.info);
    const lastUsage = asRecord(info.last_token_usage);
    const totalUsage = asRecord(info.total_token_usage);
    const isLastUsage = Object.keys(lastUsage).length > 0;
    const sourceUsage = isLastUsage ? lastUsage : totalUsage;
    const fields = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens"];
    const totals = Object.fromEntries(fields.map((field) => [field, count(sourceUsage[field])])) as Record<string, number | null>;
    if (totals.input_tokens === null || totals.output_tokens === null) continue;
    const timestampValue = typeof record.timestamp === "string" ? record.timestamp : null;
    const eventTurnId = typeof payload.turn_id === "string" ? payload.turn_id
      : typeof info.turn_id === "string" ? info.turn_id : null;
    const fingerprint = JSON.stringify([timestampValue, info.model ?? modelRef, eventTurnId, totals]);
    if (seenTokenEvents.has(fingerprint)) continue;
    seenTokenEvents.add(fingerprint);

    const usage = Object.fromEntries(fields.map((field) => {
      const current = totals[field];
      if (current === null || isLastUsage) return [field, current];
      const previous = previousTotals?.[field];
      return [field, previous === null || previous === undefined ? current : current >= previous ? current - previous : current];
    })) as Record<string, number | null>;
    const totalValues = Object.fromEntries(fields.map((field) => [field, count(totalUsage[field])])) as Record<string, number | null>;
    if (totalValues.input_tokens !== null && totalValues.output_tokens !== null) previousTotals = totalValues;
    else if (!isLastUsage) previousTotals = totals;
    const timestamp = timestampValue && Number.isFinite(Date.parse(timestampValue))
      ? new Date(timestampValue).toISOString() : null;
    const safeModel = sanitizeHistoricalModelRef(typeof info.model === "string" ? info.model : modelRef);
    const metadataIdentity = JSON.stringify([timestamp, safeModel, eventTurnId ?? turnId, usage, pendingCompaction]);
    const eventIdentity = createHash("sha256").update(metadataIdentity).digest("hex").slice(0, 24);
    turns.push({
      sourceRef: `codex-event-${eventIdentity}`,
      occurredAt: timestamp,
      modelRef: safeModel,
      usage: {
        inputTokens: usage.input_tokens,
        cacheReadTokens: usage.cached_input_tokens,
        cacheWriteTokens: null,
        outputTokens: usage.output_tokens,
      },
      reportedCostUsd: null,
      estimatedCostUsd: null,
      boundaryHint: pendingCompaction ? "compaction" : "none",
      provenance: { adapter: "codex-session-jsonl-v1", sourceEventRef: `codex-event-${eventIdentity}` },
    });
    pendingCompaction = false;
  }

  return historicalWorkInputSchema.parse({ schemaVersion: "1", ...safeOptions(options), turns });
}

/** Imports assistant usage records from Claude Code project JSONL, dropping all conversation fields. */
export function importClaudeCodeJsonl(text: string, options: HistoryImportOptions): HistoricalWorkInput {
  const turns: HistoricalWorkInput["turns"] = [];
  let eventIndex = 0;
  for (const record of parseJsonLines(text)) {
    if (record.type !== "assistant") continue;
    const message = asRecord(record.message);
    const usage = asRecord(message.usage);
    const inputTokens = count(usage.input_tokens);
    const outputTokens = count(usage.output_tokens);
    if (inputTokens === null || outputTokens === null) continue;
    const timestamp = typeof record.timestamp === "string" && Number.isFinite(Date.parse(record.timestamp))
      ? new Date(record.timestamp).toISOString() : null;
    const eventId = typeof record.uuid === "string" ? record.uuid
      : typeof message.id === "string" ? message.id : `event-${timestamp ?? "unknown"}-${eventIndex + 1}`;
    eventIndex += 1;
    const eventRef = safeEventRef("claude-code-project-jsonl-v1", eventId);
    turns.push({
      sourceRef: eventRef,
      occurredAt: timestamp,
      modelRef: sanitizeHistoricalModelRef(message.model),
      usage: {
        inputTokens,
        cacheReadTokens: count(usage.cache_read_input_tokens),
        cacheWriteTokens: count(usage.cache_creation_input_tokens),
        outputTokens,
      },
      reportedCostUsd: null,
      estimatedCostUsd: null,
      boundaryHint: "none",
      provenance: { adapter: "claude-code-project-jsonl-v1", sourceEventRef: eventRef },
    });
  }
  return historicalWorkInputSchema.parse({ schemaVersion: "1", ...safeOptions(options), turns });
}

/** Exports a stable, metadata-only JSON report suitable for local review or file output. */
export function exportHistoricalWorkReport(reconstruction: HistoricalWorkReconstruction): string {
  return JSON.stringify({
    schemaVersion: reconstruction.schemaVersion,
    algorithmVersion: reconstruction.algorithmVersion,
    configurationVersion: reconstruction.configurationVersion,
    sourceRef: reconstruction.sourceRef,
    projectRef: reconstruction.projectRef,
    coverage: reconstruction.coverage,
    privacy: reconstruction.privacy,
    summary: {
      turnCount: reconstruction.turns.length,
      taskCount: reconstruction.tasks.length,
      sittingCount: reconstruction.sittings.length,
      pricingCoverage: {
        reported: reconstruction.turns.filter((turn) => turn.pricingCoverage === "reported").length,
        estimated: reconstruction.turns.filter((turn) => turn.pricingCoverage === "estimated").length,
        unknown: reconstruction.turns.filter((turn) => turn.pricingCoverage === "unknown").length,
      },
    },
    turns: reconstruction.turns.map((turn) => ({
      turnRef: turn.turnRef,
      occurredAt: turn.occurredAt,
      modelRef: turn.modelRef,
      usage: turn.usage,
      reportedCostUsd: turn.reportedCostUsd,
      estimatedCostUsd: turn.estimatedCostUsd,
      pricingCoverage: turn.pricingCoverage,
      provenance: turn.provenance,
    })),
    tasks: reconstruction.tasks,
    sittings: reconstruction.sittings,
    review: reconstruction.review,
  }, null, 2);
}
