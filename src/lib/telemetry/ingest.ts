import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import {
  budgetDecisionReceiptSchema,
  llmCallReceiptSchema,
  outcomeReceiptSchema,
  runReceiptSchema,
  telemetryEventSchema,
  toolCallReceiptSchema,
  turnReceiptSchema,
  type TelemetryEventInput,
} from "@/lib/telemetry/schemas";
import { assertMetadataOnly } from "@/lib/telemetry/privacy";

export interface IngestContext {
  organizationId: string;
  projectId?: string | null;
}

export interface IngestResult {
  sourceEventId: string;
  duplicate: boolean;
  materializedType?: string;
  materializedId?: string;
}

type Tx = Parameters<PostgresJsDatabase<typeof schema>["transaction"]>[0] extends (tx: infer T) => unknown ? T : never;

const money = (value: number | null | undefined) => (value === null || value === undefined ? null : value.toString());
const score = money;

export function parseTelemetryEvent(context: IngestContext, input: unknown): TelemetryEventInput {
  const event = telemetryEventSchema.parse(input);
  assertMetadataOnly(event.payload);
  if (context.projectId && event.projectId && context.projectId !== event.projectId) {
    throw new Error("PROJECT_SCOPE_VIOLATION");
  }
  return event;
}

async function ensureRunOwned(tx: Tx, organizationId: string, runId: string) {
  const row = (await tx.select({ organizationId: schema.runs.organizationId }).from(schema.runs).where(eq(schema.runs.id, runId)).limit(1))[0];
  if (!row) throw new Error("RUN_NOT_FOUND");
  if (row.organizationId !== organizationId) throw new Error("CROSS_TENANT_REFERENCE");
}

async function ensureTurnOwned(tx: Tx, organizationId: string, runId: string, turnId: string) {
  const row = (await tx.select({ organizationId: schema.turns.organizationId, runId: schema.turns.runId }).from(schema.turns).where(eq(schema.turns.id, turnId)).limit(1))[0];
  if (!row) throw new Error("TURN_NOT_FOUND");
  if (row.organizationId !== organizationId || row.runId !== runId) throw new Error("CROSS_TENANT_REFERENCE");
}

async function ensureLlmCallOwned(tx: Tx, organizationId: string, runId: string, callId: string) {
  const row = (await tx.select({ organizationId: schema.llmCalls.organizationId, runId: schema.llmCalls.runId }).from(schema.llmCalls).where(eq(schema.llmCalls.id, callId)).limit(1))[0];
  if (!row) throw new Error("LLM_CALL_NOT_FOUND");
  if (row.organizationId !== organizationId || row.runId !== runId) throw new Error("CROSS_TENANT_REFERENCE");
}

async function materialize(tx: Tx, context: IngestContext, event: TelemetryEventInput): Promise<Pick<IngestResult, "materializedId" | "materializedType">> {
  if (event.eventType === "run.upsert") {
    const data = runReceiptSchema.parse(event.payload);
    const existing = (await tx.select({ organizationId: schema.runs.organizationId }).from(schema.runs).where(eq(schema.runs.id, data.id)).limit(1))[0];
    if (existing && existing.organizationId !== context.organizationId) throw new Error("CROSS_TENANT_REFERENCE");
    const projectId = data.projectId ?? event.projectId ?? context.projectId ?? null;
    if (context.projectId && projectId && context.projectId !== projectId) throw new Error("PROJECT_SCOPE_VIOLATION");
    const values = {
      id: data.id,
      organizationId: context.organizationId,
      projectId,
      developerUserId: data.developerUserId ?? null,
      serviceAccountId: data.serviceAccountId ?? null,
      environment: data.environment,
      agentName: data.agentName,
      agentVendor: data.agentVendor ?? null,
      agentVersion: data.agentVersion ?? null,
      workflowName: data.workflowName ?? null,
      workflowVersion: data.workflowVersion ?? null,
      repo: data.repo ?? null,
      branch: data.branch ?? null,
      repoCommitSha: data.repoCommitSha ?? null,
      issueOrTicketId: data.issueOrTicketId ?? null,
      startedAt: data.startedAt,
      endedAt: data.endedAt ?? null,
      status: data.status,
      terminationReason: data.terminationReason ?? null,
      estimatedCostUsd: money(data.estimatedCostUsd),
      actualCostUsd: money(data.actualCostUsd),
      reconciledCostUsd: money(data.reconciledCostUsd),
      budgetLimitUsd: money(data.budgetLimitUsd),
      freshInputTokens: data.freshInputTokens,
      cacheReadTokens: data.cacheReadTokens,
      cacheWriteTokens: data.cacheWriteTokens,
      reasoningTokens: data.reasoningTokens,
      outputTokens: data.outputTokens,
      toolCallCount: data.toolCallCount,
      retryCount: data.retryCount,
      fallbackCount: data.fallbackCount,
      turnCount: data.turnCount,
      finalArtifactType: data.finalArtifactType ?? null,
      finalArtifactReference: data.finalArtifactReference ?? null,
      outcomeStatus: data.outcomeStatus ?? null,
      outcomeScore: score(data.outcomeScore),
      usageSource: data.usageSource,
      metadata: data.metadata,
      updatedAt: new Date(),
    };
    await tx.insert(schema.runs).values(values).onConflictDoUpdate({ target: schema.runs.id, set: values });
    return { materializedType: "run", materializedId: data.id };
  }

  if (event.eventType === "turn.upsert") {
    const data = turnReceiptSchema.parse(event.payload);
    await ensureRunOwned(tx, context.organizationId, data.runId);
    const values = {
      id: data.id,
      organizationId: context.organizationId,
      runId: data.runId,
      turnIndex: data.turnIndex,
      startedAt: data.startedAt,
      endedAt: data.endedAt ?? null,
      status: data.status,
      modelRequested: data.modelRequested ?? null,
      modelResolved: data.modelResolved ?? null,
      reasoningEffort: data.reasoningEffort ?? null,
      freshInputTokens: data.freshInputTokens,
      cacheReadTokens: data.cacheReadTokens,
      cacheWriteTokens: data.cacheWriteTokens,
      reasoningTokens: data.reasoningTokens,
      outputTokens: data.outputTokens,
      costUsd: money(data.costUsd),
      toolCallCount: data.toolCallCount,
      retryCount: data.retryCount,
      fallbackCount: data.fallbackCount,
      latencyMs: data.latencyMs ?? null,
      timeToFirstTokenMs: data.timeToFirstTokenMs ?? null,
      contextTokensBefore: data.contextTokensBefore ?? null,
      contextTokensAfter: data.contextTokensAfter ?? null,
      contextUtilizationPct: money(data.contextUtilizationPct),
      usageSource: data.usageSource,
      metadata: data.metadata,
      updatedAt: new Date(),
    };
    await tx.insert(schema.turns).values(values).onConflictDoUpdate({ target: schema.turns.id, set: values });
    return { materializedType: "turn", materializedId: data.id };
  }

  if (event.eventType === "llm_call.recorded") {
    const data = llmCallReceiptSchema.parse(event.payload);
    await ensureRunOwned(tx, context.organizationId, data.runId);
    if (data.turnId) await ensureTurnOwned(tx, context.organizationId, data.runId, data.turnId);
    if (data.fallbackFromCallId) await ensureLlmCallOwned(tx, context.organizationId, data.runId, data.fallbackFromCallId);
    await tx.insert(schema.llmCalls).values({
      id: data.id,
      organizationId: context.organizationId,
      runId: data.runId,
      turnId: data.turnId ?? null,
      provider: data.provider,
      modelRequested: data.modelRequested ?? null,
      modelResolved: data.modelResolved ?? null,
      providerRequestId: data.providerRequestId ?? null,
      freshInputTokens: data.freshInputTokens ?? null,
      cacheReadTokens: data.cacheReadTokens ?? null,
      cacheWriteTokens: data.cacheWriteTokens ?? null,
      audioInputTokens: data.audioInputTokens ?? null,
      imageInputUnits: data.imageInputUnits ?? null,
      searchUnits: data.searchUnits ?? null,
      reasoningTokens: data.reasoningTokens ?? null,
      outputTokens: data.outputTokens ?? null,
      costUsd: money(data.costUsd),
      costSource: data.costSource,
      pricingVersion: data.pricingVersion ?? null,
      serviceTier: data.serviceTier ?? null,
      latencyMs: data.latencyMs ?? null,
      timeToFirstTokenMs: data.timeToFirstTokenMs ?? null,
      statusCode: data.statusCode ?? null,
      attemptIndex: data.attemptIndex,
      fallbackFromCallId: data.fallbackFromCallId ?? null,
      startedAt: data.startedAt,
      endedAt: data.endedAt ?? null,
      metadata: data.metadata,
    }).onConflictDoNothing();
    return { materializedType: "llm_call", materializedId: data.id };
  }

  if (event.eventType === "tool_call.recorded") {
    const data = toolCallReceiptSchema.parse(event.payload);
    await ensureRunOwned(tx, context.organizationId, data.runId);
    if (data.turnId) await ensureTurnOwned(tx, context.organizationId, data.runId, data.turnId);
    if (data.parentLlmCallId) await ensureLlmCallOwned(tx, context.organizationId, data.runId, data.parentLlmCallId);
    await tx.insert(schema.toolCalls).values({
      id: data.id,
      organizationId: context.organizationId,
      runId: data.runId,
      turnId: data.turnId ?? null,
      parentLlmCallId: data.parentLlmCallId ?? null,
      toolName: data.toolName,
      toolCategory: data.toolCategory,
      startedAt: data.startedAt,
      endedAt: data.endedAt ?? null,
      status: data.status,
      attemptIndex: data.attemptIndex,
      inputSizeBytes: data.inputSizeBytes ?? null,
      outputSizeBytes: data.outputSizeBytes ?? null,
      outputTokensEstimated: data.outputTokensEstimated ?? null,
      isRetry: data.isRetry,
      resourceHash: data.resourceHash ?? null,
      metadata: data.metadata,
    }).onConflictDoNothing();
    return { materializedType: "tool_call", materializedId: data.id };
  }

  if (event.eventType === "outcome.recorded") {
    const data = outcomeReceiptSchema.parse(event.payload);
    await ensureRunOwned(tx, context.organizationId, data.runId);
    const values = {
      organizationId: context.organizationId,
      runId: data.runId,
      status: data.status,
      score: score(data.score),
      taskCompleted: data.taskCompleted ?? null,
      testsPassed: data.testsPassed ?? null,
      commitSha: data.commitSha ?? null,
      prNumber: data.prNumber ?? null,
      ciPassed: data.ciPassed ?? null,
      merged: data.merged ?? null,
      deploymentSuccessful: data.deploymentSuccessful ?? null,
      associationConfidence: money(data.associationConfidence),
      metadata: data.metadata,
      updatedAt: new Date(),
    };
    const existing = (await tx.select({ id: schema.outcomes.id }).from(schema.outcomes).where(eq(schema.outcomes.runId, data.runId)).limit(1))[0];
    const outcomeId = existing?.id ?? `out_${randomUUID()}`;
    await tx.insert(schema.outcomes).values({ id: outcomeId, ...values }).onConflictDoUpdate({ target: schema.outcomes.runId, set: values });
    await tx.update(schema.runs).set({ outcomeStatus: data.status, outcomeScore: score(data.score), updatedAt: new Date() }).where(and(eq(schema.runs.id, data.runId), eq(schema.runs.organizationId, context.organizationId)));
    return { materializedType: "outcome", materializedId: outcomeId };
  }

  const data = budgetDecisionReceiptSchema.parse(event.payload);
  if (data.runId) await ensureRunOwned(tx, context.organizationId, data.runId);
  const decisionId = `dec_${randomUUID()}`;
  await tx.insert(schema.budgetDecisions).values({
    id: decisionId,
    organizationId: context.organizationId,
    runId: data.runId ?? null,
    policyId: data.policyId ?? null,
    action: data.action,
    reason: data.reason,
    projectedCostUsd: money(data.projectedCostUsd),
    observedCostUsd: money(data.observedCostUsd),
    decisionData: data.decisionData,
    decidedAt: data.decidedAt,
  });
  return { materializedType: "budget_decision", materializedId: decisionId };
}

export async function ingestParsedTelemetryEvent(
  tx: Tx,
  context: IngestContext,
  event: TelemetryEventInput,
): Promise<IngestResult> {
  const inserted = await tx.insert(schema.usageEvents).values({
    id: `evt_${randomUUID()}`,
    organizationId: context.organizationId,
    projectId: event.projectId ?? context.projectId ?? null,
    runId: event.runId ?? null,
    sourceEventId: event.sourceEventId,
    source: event.source,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    payload: event.payload,
  }).onConflictDoNothing().returning({ id: schema.usageEvents.id });

  if (inserted.length === 0) return { sourceEventId: event.sourceEventId, duplicate: true };
  const materialized = await materialize(tx, context, event);
  return { sourceEventId: event.sourceEventId, duplicate: false, ...materialized };
}

export async function ingestTelemetryEvent(
  db: PostgresJsDatabase<typeof schema>,
  context: IngestContext,
  input: unknown,
): Promise<IngestResult> {
  const event = parseTelemetryEvent(context, input);
  return db.transaction((tx) => ingestParsedTelemetryEvent(tx, context, event));
}

export async function ingestTelemetryBatch(
  db: PostgresJsDatabase<typeof schema>,
  context: IngestContext,
  inputs: readonly unknown[],
): Promise<IngestResult[]> {
  // Parse and enforce metadata-only privacy before opening the transaction. This
  // means malformed payloads cannot leave a partially materialized economic batch.
  const events = inputs.map((input) => parseTelemetryEvent(context, input));

  return db.transaction(async (tx) => {
    const results: IngestResult[] = [];
    for (const event of events) {
      results.push(await ingestParsedTelemetryEvent(tx, context, event));
    }
    return results;
  });
}
