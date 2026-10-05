import { createHash } from "node:crypto";
import * as z from "zod";

const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative().nullable(),
  cacheReadTokens: z.number().int().nonnegative().nullable(),
  cacheWriteTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
}).strict();

const turnProvenanceSchema = z.object({
  adapter: z.string().min(1).max(80),
  sourceEventRef: z.string().min(1).max(240),
}).strict();

export const historicalTurnSchema = z.object({
  sourceRef: z.string().min(1).max(240),
  occurredAt: z.string().datetime({ offset: true }).nullable(),
  modelRef: z.string().min(1).max(200).nullable(),
  usage: usageSchema,
  reportedCostUsd: z.number().finite().nonnegative().nullable(),
  estimatedCostUsd: z.number().finite().nonnegative().nullable(),
  boundaryHint: z.enum(["none", "compaction", "explicit"]).default("none"),
  provenance: turnProvenanceSchema.optional(),
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
    provenance: { adapter: string; sourceEventRef: string } | null;
  }>;
  tasks: Array<{
    taskRef: string;
    turnRefs: string[];
    confidence: "high" | "medium" | "low";
    boundaryBefore: "session_start" | "pause" | "compaction" | "explicit" | "reviewed";
  }>;
  sittings: Array<{ sittingRef: string; taskRefs: string[]; startedAt: string | null; endedAt: string | null }>;
  review: {
    status: "unreviewed" | "reviewed";
    boundaries: Array<{
      beforeTurnRef: string;
      decision: "boundary" | "continue";
      evidence: "session_start" | "pause" | "compaction" | "explicit" | "reviewed" | "none";
      overrodeEvidence: boolean;
    }>;
  };
}

function opaqueRef(kind: string, value: string) {
  return `${kind}_${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

export function sanitizeHistoricalModelRef(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const publicModel = /^(?:gpt-(?:[345](?:\.\d+)?|4o)(?:-(?:mini|nano|pro|codex|turbo|chat|instruct|latest|preview|search-preview|202[4-6]-\d{2}-\d{2}))*|o[1-4](?:-(?:mini|pro|preview|latest|202[4-6]-\d{2}-\d{2}))*|chatgpt-(?:4o|5)(?:-(?:mini|latest|202[4-6]-\d{2}-\d{2}))*|claude-(?:\d+(?:-\d+)?-(?:sonnet|opus|haiku)|(?:sonnet|opus|haiku)-\d+(?:-\d+)?)(?:-\d{8})?|gemini-\d+(?:\.\d+)?(?:-(?:pro|flash|flash-lite|flash-8b|nano|exp|experimental|preview|latest|thinking|\d{2}-\d{2}))*|gemma-\d+(?:-(?:1b|4b|9b|12b|27b|it))*|models\/gemini-\d+(?:\.\d+)?(?:-(?:pro|flash|flash-lite|flash-8b|nano|preview|latest|thinking|\d{2}-\d{2}))*)$/i;
  if (publicModel.test(value)) {
    return value;
  }
  return `unknown_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

/** Deterministic reconstruction over normalized metadata. Boundaries are heuristics, never inferred intent. */
export function reconstructHistoricalWork(input: unknown): HistoricalWorkReconstruction {
  const parsed = historicalWorkInputSchema.parse(input);
  const uniqueTurns = new Map<string, HistoricalWorkInput["turns"][number]>();
  for (const turn of parsed.turns) {
    const previous = uniqueTurns.get(turn.sourceRef);
    if (previous && JSON.stringify(previous) !== JSON.stringify(turn)) {
      throw new Error("Conflicting duplicate history event");
    }
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
    modelRef: sanitizeHistoricalModelRef(turn.modelRef),
    usage: turn.usage,
    reportedCostUsd: turn.reportedCostUsd,
    estimatedCostUsd: turn.estimatedCostUsd,
    pricingCoverage: turn.reportedCostUsd !== null ? "reported" as const
      : turn.estimatedCostUsd !== null ? "estimated" as const : "unknown" as const,
    provenance: turn.provenance ? {
      adapter: ["token-intelligence-history-v1", "codex-session-jsonl-v1", "claude-code-project-jsonl-v1"].includes(turn.provenance.adapter)
        ? turn.provenance.adapter : "unknown-adapter",
      sourceEventRef: opaqueRef("event", `${historyRef}:${turn.provenance.adapter}:${turn.provenance.sourceEventRef}`),
    } : null,
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
        turnRefs: [],
        confidence: boundaryBefore === "explicit" ? "high"
          : boundaryBefore === "compaction" ? "medium"
            : boundaryBefore === "session_start" ? "medium" : "low",
        boundaryBefore: boundaryBefore ?? "session_start",
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
    const taskEndedAt = occurredAtByTurnRef.get(task.turnRefs.at(-1) ?? "") ?? null;
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
      previousTaskTime = time;
    }
    sittingEnd = taskEndedAt;
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
    review: {
      status: "unreviewed",
      boundaries: turns.map((turn, index) => {
        const task = tasks.find((candidate) => candidate.turnRefs[0] === turn.turnRef);
        const evidence = task?.boundaryBefore ?? "none";
        return {
          beforeTurnRef: turn.turnRef,
          decision: index === 0 || task ? "boundary" as const : "continue" as const,
          evidence,
          overrodeEvidence: false,
        };
      }),
    },
  };
}

export const historicalWorkReviewSchema = z.object({
  schemaVersion: z.literal("1"),
  boundaries: z.array(z.object({
    beforeTurnRef: z.string().min(1),
    decision: z.enum(["boundary", "continue"]),
  }).strict()),
}).strict();

/** Applies an in-memory boundary review. No source data or persistence is involved. */
export function applyHistoricalWorkReview(
  reconstruction: HistoricalWorkReconstruction,
  reviewInput: unknown,
): HistoricalWorkReconstruction {
  const review = historicalWorkReviewSchema.parse(reviewInput);
  const decisions = new Map(review.boundaries.map((item) => [item.beforeTurnRef, item.decision]));
  const refs = reconstruction.turns.map((turn) => turn.turnRef);
  if (decisions.size !== review.boundaries.length || decisions.size !== refs.length
    || refs.some((ref) => !decisions.has(ref)) || (refs.length > 0 && decisions.get(refs[0]) !== "boundary")) {
    throw new Error("Review must contain one decision per turn and start with a boundary");
  }
  const originalBoundary = new Map(reconstruction.tasks.map((task) => [task.turnRefs[0], task.boundaryBefore] as const));
  const tasks: HistoricalWorkReconstruction["tasks"] = [];
  let current: HistoricalWorkReconstruction["tasks"][number] | undefined;
  for (const turn of reconstruction.turns) {
    const isBoundary = decisions.get(turn.turnRef) === "boundary";
    if (!current || isBoundary) {
      const evidence = originalBoundary.get(turn.turnRef);
      const boundaryBefore = tasks.length === 0 ? "session_start"
        : evidence ?? "reviewed";
      current = {
        taskRef: opaqueRef("task", `${reconstruction.sourceRef}:${turn.turnRef}:review-v1`),
        turnRefs: [],
        confidence: boundaryBefore === "explicit" || boundaryBefore === "reviewed" ? "high"
          : boundaryBefore === "compaction" ? "medium"
            : boundaryBefore === "session_start" ? "medium" : "low",
        boundaryBefore,
      };
      tasks.push(current);
    }
    current.turnRefs.push(turn.turnRef);
  }
  const taskTime = (task: HistoricalWorkReconstruction["tasks"][number]) => {
    const value = reconstruction.turns.find((turn) => turn.turnRef === task.turnRefs[0])?.occurredAt;
    return value ? Date.parse(value) : null;
  };
  const sittings: HistoricalWorkReconstruction["sittings"] = [];
  let group: HistoricalWorkReconstruction["tasks"] = [];
  let prior: number | null = null;
  for (const task of tasks) {
    const time = taskTime(task);
    if (time !== null && prior !== null && time - prior >= 6 * 60 * 60_000) {
      pushSitting(group, reconstruction, sittings);
      group = [];
    }
    group.push(task);
    if (time !== null) prior = time;
  }
  pushSitting(group, reconstruction, sittings);
  return {
    ...reconstruction,
    tasks,
    sittings,
    review: {
      status: "reviewed",
      boundaries: reconstruction.turns.map((turn) => ({
        beforeTurnRef: turn.turnRef,
        decision: decisions.get(turn.turnRef)!,
        evidence: originalBoundary.get(turn.turnRef) ?? (decisions.get(turn.turnRef) === "boundary" ? "reviewed" : "none"),
        overrodeEvidence: originalBoundary.has(turn.turnRef) && originalBoundary.get(turn.turnRef) !== "session_start"
          && decisions.get(turn.turnRef) !== "boundary",
      })),
    },
  };
}

function pushSitting(
  tasks: HistoricalWorkReconstruction["tasks"],
  reconstruction: HistoricalWorkReconstruction,
  sittings: HistoricalWorkReconstruction["sittings"],
) {
  if (!tasks.length) return;
  const byRef = new Map(reconstruction.turns.map((turn) => [turn.turnRef, turn.occurredAt]));
  const startedAt = byRef.get(tasks[0].turnRefs[0]) ?? null;
  const endedAt = byRef.get(tasks.at(-1)!.turnRefs.at(-1)!) ?? null;
  sittings.push({
    sittingRef: opaqueRef("sitting", `${reconstruction.sourceRef}:${tasks.map((task) => task.taskRef).join(":")}`),
    taskRefs: tasks.map((task) => task.taskRef), startedAt, endedAt,
  });
}
