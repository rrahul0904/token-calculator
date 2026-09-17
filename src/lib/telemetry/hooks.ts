import * as z from "zod";
import { assertMetadataOnly } from "@/lib/telemetry/privacy";
import type { TelemetryEventInput } from "@/lib/telemetry/schemas";

export const hookEventSchema = z.object({
  hookId: z.string().min(1).max(240),
  source: z.string().min(1).max(120),
  event: z.enum(["run.started", "turn.started", "llm.completed", "tool.completed", "run.completed"]),
  occurredAt: z.coerce.date(),
  projectId: z.string().max(180).nullable().optional(),
  runId: z.string().min(8).max(180),
  turnId: z.string().max(180).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  usage: z.object({
    provider: z.string().max(120).optional(),
    model: z.string().max(200).optional(),
    freshInputTokens: z.number().int().nonnegative().nullable().optional(),
    cacheReadTokens: z.number().int().nonnegative().nullable().optional(),
    cacheWriteTokens: z.number().int().nonnegative().nullable().optional(),
    reasoningTokens: z.number().int().nonnegative().nullable().optional(),
    outputTokens: z.number().int().nonnegative().nullable().optional(),
    costUsd: z.number().nonnegative().nullable().optional(),
    usageSource: z.enum(["provider_measured", "agent_measured", "local_tokenizer_reference", "estimated", "reconciled"]).optional(),
  }).optional(),
  tool: z.object({
    name: z.string().min(1).max(240),
    category: z.enum(["shell", "filesystem", "search", "mcp", "browser", "database", "other"]).default("other"),
    status: z.string().min(1).max(80).default("completed"),
    inputSizeBytes: z.number().int().nonnegative().nullable().optional(),
    outputSizeBytes: z.number().int().nonnegative().nullable().optional(),
    outputTokensEstimated: z.number().int().nonnegative().nullable().optional(),
    resourceHash: z.string().max(180).nullable().optional(),
    isRetry: z.boolean().default(false),
  }).optional(),
  outcome: z.object({
    status: z.string().min(1).max(80),
    score: z.number().finite().nullable().optional(),
    taskCompleted: z.boolean().nullable().optional(),
    testsPassed: z.boolean().nullable().optional(),
    commitSha: z.string().max(80).nullable().optional(),
    prNumber: z.number().int().positive().nullable().optional(),
    ciPassed: z.boolean().nullable().optional(),
    merged: z.boolean().nullable().optional(),
    deploymentSuccessful: z.boolean().nullable().optional(),
  }).optional(),
});

export type HookEventInput = z.infer<typeof hookEventSchema>;

function sourceEventId(hook: HookEventInput, suffix: string) {
  return `hook:${hook.source}:${hook.hookId}:${suffix}`;
}

export function normalizeHookEvent(input: unknown): TelemetryEventInput[] {
  const hook = hookEventSchema.parse(input);
  assertMetadataOnly(hook.metadata);
  const base = { source: `hook:${hook.source}`, occurredAt: hook.occurredAt, projectId: hook.projectId ?? null, runId: hook.runId };

  if (hook.event === "run.started") {
    return [{
      ...base,
      sourceEventId: sourceEventId(hook, "run-started"),
      eventType: "run.upsert",
      payload: {
        id: hook.runId,
        projectId: hook.projectId ?? null,
        agentName: hook.source,
        startedAt: hook.occurredAt,
        status: "running",
        usageSource: hook.usage?.usageSource ?? "estimated",
        metadata: { ...hook.metadata, hook: true, contentStored: false },
      },
    }];
  }

  if (hook.event === "turn.started") {
    if (!hook.turnId) throw new Error("HOOK_TURN_ID_REQUIRED");
    return [{
      ...base,
      sourceEventId: sourceEventId(hook, "turn-started"),
      eventType: "turn.upsert",
      payload: {
        id: hook.turnId,
        runId: hook.runId,
        turnIndex: Number(hook.metadata.turnIndex ?? 0),
        startedAt: hook.occurredAt,
        status: "running",
        usageSource: hook.usage?.usageSource ?? "estimated",
        metadata: { ...hook.metadata, hook: true, contentStored: false },
      },
    }];
  }

  if (hook.event === "llm.completed") {
    if (!hook.usage?.provider) throw new Error("HOOK_PROVIDER_REQUIRED");
    return [{
      ...base,
      sourceEventId: sourceEventId(hook, "llm-completed"),
      eventType: "llm_call.recorded",
      payload: {
        id: `llm_${hook.hookId}`,
        runId: hook.runId,
        turnId: hook.turnId ?? null,
        provider: hook.usage.provider,
        modelRequested: hook.usage.model ?? null,
        modelResolved: hook.usage.model ?? null,
        freshInputTokens: hook.usage.freshInputTokens ?? null,
        cacheReadTokens: hook.usage.cacheReadTokens ?? null,
        cacheWriteTokens: hook.usage.cacheWriteTokens ?? null,
        reasoningTokens: hook.usage.reasoningTokens ?? null,
        outputTokens: hook.usage.outputTokens ?? null,
        costUsd: hook.usage.costUsd ?? null,
        costSource: hook.usage.usageSource ?? "estimated",
        startedAt: hook.occurredAt,
        endedAt: hook.occurredAt,
        metadata: { ...hook.metadata, hook: true, contentStored: false },
      },
    }];
  }

  if (hook.event === "tool.completed") {
    if (!hook.tool) throw new Error("HOOK_TOOL_REQUIRED");
    return [{
      ...base,
      sourceEventId: sourceEventId(hook, "tool-completed"),
      eventType: "tool_call.recorded",
      payload: {
        id: `tool_${hook.hookId}`,
        runId: hook.runId,
        turnId: hook.turnId ?? null,
        toolName: hook.tool.name,
        toolCategory: hook.tool.category,
        startedAt: hook.occurredAt,
        endedAt: hook.occurredAt,
        status: hook.tool.status,
        inputSizeBytes: hook.tool.inputSizeBytes ?? null,
        outputSizeBytes: hook.tool.outputSizeBytes ?? null,
        outputTokensEstimated: hook.tool.outputTokensEstimated ?? null,
        resourceHash: hook.tool.resourceHash ?? null,
        isRetry: hook.tool.isRetry,
        metadata: { ...hook.metadata, hook: true, contentStored: false },
      },
    }];
  }

  const events: TelemetryEventInput[] = [{
    ...base,
    sourceEventId: sourceEventId(hook, "run-completed"),
    eventType: "run.upsert",
    payload: {
      id: hook.runId,
      projectId: hook.projectId ?? null,
      agentName: hook.source,
      startedAt: hook.metadata.startedAt ?? hook.occurredAt,
      endedAt: hook.occurredAt,
      status: hook.outcome?.status === "failed" ? "failed" : "completed",
      outcomeStatus: hook.outcome?.status ?? null,
      usageSource: hook.usage?.usageSource ?? "estimated",
      metadata: { ...hook.metadata, hook: true, contentStored: false },
    },
  }];
  if (hook.outcome) {
    events.push({
      ...base,
      sourceEventId: sourceEventId(hook, "outcome"),
      eventType: "outcome.recorded",
      payload: { runId: hook.runId, ...hook.outcome, metadata: { hook: true, contentStored: false } },
    });
  }
  return events;
}
