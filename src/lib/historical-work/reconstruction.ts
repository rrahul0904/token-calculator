import { createHash } from "node:crypto";
import * as z from "zod";

const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative().nullable(),
  cacheReadTokens: z.number().int().nonnegative().nullable(),
  cacheWriteTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
}).strict();

export const historicalTurnSchema = z.object({
  sourceRef: z.string().min(1).max(240),
  occurredAt: z.string().datetime({ offset: true }).nullable(),
  modelRef: z.string().min(1).max(200).nullable(),
  usage: usageSchema,
  reportedCostUsd: z.number().finite().nonnegative().nullable(),
  estimatedCostUsd: z.number().finite().nonnegative().nullable(),
  boundaryHint: z.enum(["none", "compaction", "explicit"]).default("none"),
}).strict();

export const historicalWorkInputSchema = z.object({
  schemaVersion: z.literal("1"),
  sourceRef: z.string().min(1).max(240),
  projectRef: z.string().min(1).max(240),
  turns: z.array(historicalTurnSchema).max(20_000),
}).strict();

export type HistoricalWorkInput = z.infer<typeof historicalWorkInputSchema>;

export interface HistoricalWorkReconstruction {
  schemaVersion: "1";
  algorithmVersion: "ti-time-boundary-v1";
  configurationVersion: "pause-30m-sitting-6h-v1";
  sourceRef: string;
  projectRef: string;
  coverage: "complete" | "partial";
  privacy: {
    readOnly: true;
    networkUsed: false;
    rawPromptsRetained: false;
    sourcePathsRetained: false;
    onlyMetadataReturned: true;
  };
  turns: Array<{
    turnRef: string;
    occurredAt: string | null;
    modelRef: string | null;
    usage: HistoricalWorkInput["turns"][number]["usage"];
    reportedCostUsd: number | null;
    estimatedCostUsd: number | null;
    pricingCoverage: "reported" | "estimated" | "unknown";
  }>;
  tasks: Array<{
    taskRef: string;
    turnRefs: string[];
    confidence: "heuristic";
    boundaryBefore: "session_start" | "pause" | "compaction" | "explicit";
  }>;
  sittings: Array<{ sittingRef: string; taskRefs: string[]; startedAt: string | null; endedAt: string | null }>;
}

function opaqueRef(kind: string, value: string) {
  return `${kind}_${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

/** Deterministic reconstruction over normalized metadata. Boundaries are heuristics, never inferred intent. */
export function reconstructHistoricalWork(input: unknown): HistoricalWorkReconstruction {
  const parsed = historicalWorkInputSchema.parse(input);
  const uniqueTurns = new Map<string, HistoricalWorkInput["turns"][number]>();
  for (const turn of parsed.turns) {
    const previous = uniqueTurns.get(turn.sourceRef);
    const nextTime = turn.occurredAt ? Date.parse(turn.occurredAt) : null;
    const previousTime = previous?.occurredAt ? Date.parse(previous.occurredAt) : null;
    if (!previous || (nextTime !== null && (previousTime === null || nextTime > previousTime))
      || (nextTime === previousTime && JSON.stringify(turn) < JSON.stringify(previous))) {
      uniqueTurns.set(turn.sourceRef, turn);
    }
  }
  const historyRef = `${parsed.projectRef}:${parsed.sourceRef}`;
  const ordered = [...uniqueTurns.values()]
    .map((turn, index) => ({ ...turn, sourceIndex: index, time: turn.occurredAt ? Date.parse(turn.occurredAt) : null }))
    .sort((left, right) => (left.time ?? Number.MAX_SAFE_INTEGER) - (right.time ?? Number.MAX_SAFE_INTEGER)
      || left.sourceRef.localeCompare(right.sourceRef) || left.sourceIndex - right.sourceIndex);
  const turns = ordered.map((turn) => ({
    turnRef: opaqueRef("turn", `${historyRef}:${turn.sourceRef}`),
    occurredAt: turn.occurredAt,
    modelRef: turn.modelRef,
    usage: turn.usage,
    reportedCostUsd: turn.reportedCostUsd,
    estimatedCostUsd: turn.estimatedCostUsd,
    pricingCoverage: turn.reportedCostUsd !== null ? "reported" as const
      : turn.estimatedCostUsd !== null ? "estimated" as const : "unknown" as const,
  }));
  const tasks: HistoricalWorkReconstruction["tasks"] = [];
  let current: HistoricalWorkReconstruction["tasks"][number] | undefined;
  let previousTime: number | null = null;
  for (let index = 0; index < ordered.length; index += 1) {
    const turn = ordered[index];
    const gap = turn.time !== null && previousTime !== null ? turn.time - previousTime : null;
    const boundaryBefore = !current ? "session_start"
      : turn.boundaryHint === "explicit" ? "explicit"
        : turn.boundaryHint === "compaction" && gap !== null && gap >= 10 * 60_000 ? "compaction"
          : gap !== null && gap >= 30 * 60_000 ? "pause" : null;
    if (!current || boundaryBefore) {
      current = {
        taskRef: opaqueRef("task", `${historyRef}:${turn.sourceRef}:ti-time-boundary-v1`),
        turnRefs: [], confidence: "heuristic", boundaryBefore: boundaryBefore ?? "session_start",
      };
      tasks.push(current);
    }
    current.turnRefs.push(turns[index].turnRef);
    previousTime = turn.time;
  }
  const sittings: HistoricalWorkReconstruction["sittings"] = [];
  const occurredAtByTurnRef = new Map(turns.map((turn) => [turn.turnRef, turn.occurredAt]));
  let sittingTasks: string[] = [];
  let sittingStart: string | null = null;
  let sittingEnd: string | null = null;
  let previousTaskTime: number | null = null;
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    const taskStartedAt = occurredAtByTurnRef.get(task.turnRefs[0]) ?? null;
    const time = taskStartedAt ? Date.parse(taskStartedAt) : null;
    if (time !== null && previousTaskTime !== null && time - previousTaskTime >= 6 * 60 * 60_000) {
      sittings.push({
        sittingRef: opaqueRef("sitting", `${historyRef}:${sittingTasks.join(":")}`),
        taskRefs: sittingTasks, startedAt: sittingStart, endedAt: sittingEnd,
      });
      sittingTasks = [];
      sittingStart = null;
      sittingEnd = null;
    }
    sittingTasks.push(task.taskRef);
    if (time !== null) {
      sittingStart ??= taskStartedAt;
      sittingEnd = taskStartedAt;
      previousTaskTime = time;
    }
  }
  if (sittingTasks.length) sittings.push({
    sittingRef: opaqueRef("sitting", `${historyRef}:${sittingTasks.join(":")}`),
    taskRefs: sittingTasks, startedAt: sittingStart, endedAt: sittingEnd,
  });
  return {
    schemaVersion: "1",
    algorithmVersion: "ti-time-boundary-v1",
    configurationVersion: "pause-30m-sitting-6h-v1",
    sourceRef: opaqueRef("source", historyRef),
    projectRef: opaqueRef("project", parsed.projectRef),
    coverage: ordered.every((turn) => turn.time !== null) ? "complete" : "partial",
    privacy: { readOnly: true, networkUsed: false, rawPromptsRetained: false, sourcePathsRetained: false, onlyMetadataReturned: true },
    turns, tasks, sittings,
  };
}
