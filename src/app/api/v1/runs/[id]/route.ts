import { and, asc, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { budgetDecisions, findings, llmCalls, outcomes, runs, toolCalls, turns } from "@/db/schema";
import { authenticateRequest, authenticateApiKey } from "@/lib/auth/api-auth";
import { analyzeRun } from "@/lib/findings/engine";
import { ingestTelemetryEvent } from "@/lib/telemetry/ingest";
import { runReceiptSchema } from "@/lib/telemetry/schemas";

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const principal = await authenticateRequest(request, "read:runs");
  if (!principal) return reply({ error: "UNAUTHORIZED" }, 401);
  const { id } = await context.params;
  const db = getDb();
  const run = (await db.select().from(runs).where(and(eq(runs.id, id), eq(runs.organizationId, principal.organizationId))).limit(1))[0];
  if (!run) return reply({ error: "NOT_FOUND" }, 404);
  const [turnRows, callRows, toolRows, findingRows, decisionRows, outcomeRows] = await Promise.all([
    db.select().from(turns).where(and(eq(turns.runId, id), eq(turns.organizationId, principal.organizationId))).orderBy(asc(turns.turnIndex)),
    db.select().from(llmCalls).where(and(eq(llmCalls.runId, id), eq(llmCalls.organizationId, principal.organizationId))).orderBy(asc(llmCalls.startedAt)),
    db.select().from(toolCalls).where(and(eq(toolCalls.runId, id), eq(toolCalls.organizationId, principal.organizationId))).orderBy(asc(toolCalls.startedAt)),
    db.select().from(findings).where(and(eq(findings.runId, id), eq(findings.organizationId, principal.organizationId))),
    db.select().from(budgetDecisions).where(and(eq(budgetDecisions.runId, id), eq(budgetDecisions.organizationId, principal.organizationId))).orderBy(asc(budgetDecisions.decidedAt)),
    db.select().from(outcomes).where(and(eq(outcomes.runId, id), eq(outcomes.organizationId, principal.organizationId))).limit(1),
  ]);
  const computedFindings = analyzeRun({
    runId: id,
    status: run.status,
    totalCostUsd: Number(run.reconciledCostUsd ?? run.actualCostUsd ?? run.estimatedCostUsd ?? NaN) || null,
    outcomeStatus: run.outcomeStatus,
    turns: turnRows.map((turn) => ({
      id: turn.id, turnIndex: turn.turnIndex, status: turn.status,
      freshInputTokens: turn.freshInputTokens, cacheReadTokens: turn.cacheReadTokens, cacheWriteTokens: turn.cacheWriteTokens,
      outputTokens: turn.outputTokens, costUsd: turn.costUsd === null ? null : Number(turn.costUsd),
      contextTokensBefore: turn.contextTokensBefore, contextTokensAfter: turn.contextTokensAfter,
    })),
    toolCalls: toolRows.map((tool) => ({
      id: tool.id, turnId: tool.turnId, toolName: tool.toolName, toolCategory: tool.toolCategory, status: tool.status,
      isRetry: tool.isRetry, outputSizeBytes: tool.outputSizeBytes, outputTokensEstimated: tool.outputTokensEstimated, resourceHash: tool.resourceHash,
    })),
    llmCalls: callRows.map((call) => ({
      id: call.id, turnId: call.turnId, provider: call.provider, modelRequested: call.modelRequested, modelResolved: call.modelResolved,
      costUsd: call.costUsd === null ? null : Number(call.costUsd), fallbackFromCallId: call.fallbackFromCallId, attemptIndex: call.attemptIndex,
    })),
  });
  return reply({ data: { run, turns: turnRows, llmCalls: callRows, toolCalls: toolRows, findings: findingRows, computedFindings, budgetDecisions: decisionRows, outcome: outcomeRows[0] ?? null } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const principal = await authenticateApiKey(request, "write:runs");
  if (!principal) return reply({ error: "API_KEY_REQUIRED", scope: "write:runs" }, 401);
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = runReceiptSchema.partial().safeParse(body);
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  const db = getDb();
  const existing = (await db.select().from(runs).where(and(eq(runs.id, id), eq(runs.organizationId, principal.organizationId))).limit(1))[0];
  if (!existing) return reply({ error: "NOT_FOUND" }, 404);
  const merged = runReceiptSchema.parse({
    ...existing,
    ...parsed.data,
    id,
    projectId: parsed.data.projectId ?? existing.projectId,
    estimatedCostUsd: parsed.data.estimatedCostUsd ?? (existing.estimatedCostUsd === null ? null : Number(existing.estimatedCostUsd)),
    actualCostUsd: parsed.data.actualCostUsd ?? (existing.actualCostUsd === null ? null : Number(existing.actualCostUsd)),
    reconciledCostUsd: parsed.data.reconciledCostUsd ?? (existing.reconciledCostUsd === null ? null : Number(existing.reconciledCostUsd)),
    budgetLimitUsd: parsed.data.budgetLimitUsd ?? (existing.budgetLimitUsd === null ? null : Number(existing.budgetLimitUsd)),
    outcomeScore: parsed.data.outcomeScore ?? (existing.outcomeScore === null ? null : Number(existing.outcomeScore)),
  });
  const sourceEventId = request.headers.get("idempotency-key") ?? `run:${id}:${merged.status}:${merged.endedAt?.toISOString() ?? "open"}`;
  try {
    const result = await ingestTelemetryEvent(db, { organizationId: principal.organizationId, projectId: principal.projectId }, {
      sourceEventId, source: "rest_api", eventType: "run.upsert", occurredAt: new Date(), projectId: merged.projectId, runId: id, payload: merged,
    });
    return reply({ data: result });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "RUN_UPDATE_FAILED" }, 400);
  }
}
