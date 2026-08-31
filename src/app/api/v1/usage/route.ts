import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { llmCalls, runs } from "@/db/schema";
import { authenticateRequest } from "@/lib/auth/api-auth";

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const principal = await authenticateRequest(request, "read:usage");
  if (!principal) return reply({ error: "UNAUTHORIZED" }, 401);
  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30) || 30, 1), 365);
  const since = new Date(Date.now() - days * 86_400_000);
  const db = getDb();

  const runWhere = and(eq(runs.organizationId, principal.organizationId), gte(runs.startedAt, since));
  const callWhere = and(eq(llmCalls.organizationId, principal.organizationId), gte(llmCalls.startedAt, since));
  const [runSummary, providerRows, modelRows, recentRuns] = await Promise.all([
    db.select({
      runCount: count(),
      freshInputTokens: sql<number>`coalesce(sum(${runs.freshInputTokens}), 0)`,
      cacheReadTokens: sql<number>`coalesce(sum(${runs.cacheReadTokens}), 0)`,
      cacheWriteTokens: sql<number>`coalesce(sum(${runs.cacheWriteTokens}), 0)`,
      reasoningTokens: sql<number>`coalesce(sum(${runs.reasoningTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${runs.outputTokens}), 0)`,
      failedOrAbortedCostUsd: sql<string>`coalesce(sum(case when ${runs.status} in ('failed','aborted','cancelled','budget_blocked') then coalesce(${runs.reconciledCostUsd}, ${runs.actualCostUsd}, ${runs.estimatedCostUsd}, 0) else 0 end), 0)`,
      spendUsd: sql<string>`coalesce(sum(coalesce(${runs.reconciledCostUsd}, ${runs.actualCostUsd}, ${runs.estimatedCostUsd}, 0)), 0)`,
      successfulRuns: sql<number>`coalesce(sum(case when ${runs.outcomeStatus} in ('success','passed','merged','deployed') then 1 else 0 end), 0)`,
    }).from(runs).where(runWhere),
    db.select({
      provider: llmCalls.provider,
      calls: count(),
      costUsd: sql<string>`coalesce(sum(${llmCalls.costUsd}), 0)`,
      freshInputTokens: sql<number>`coalesce(sum(${llmCalls.freshInputTokens}), 0)`,
      cacheReadTokens: sql<number>`coalesce(sum(${llmCalls.cacheReadTokens}), 0)`,
      reasoningTokens: sql<number>`coalesce(sum(${llmCalls.reasoningTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${llmCalls.outputTokens}), 0)`,
    }).from(llmCalls).where(callWhere).groupBy(llmCalls.provider).orderBy(sql`sum(${llmCalls.costUsd}) desc nulls last`),
    db.select({
      provider: llmCalls.provider,
      model: llmCalls.modelResolved,
      calls: count(),
      costUsd: sql<string>`coalesce(sum(${llmCalls.costUsd}), 0)`,
    }).from(llmCalls).where(callWhere).groupBy(llmCalls.provider, llmCalls.modelResolved).orderBy(sql`sum(${llmCalls.costUsd}) desc nulls last`).limit(30),
    db.select({
      id: runs.id,
      projectId: runs.projectId,
      agentName: runs.agentName,
      status: runs.status,
      outcomeStatus: runs.outcomeStatus,
      estimatedCostUsd: runs.estimatedCostUsd,
      actualCostUsd: runs.actualCostUsd,
      reconciledCostUsd: runs.reconciledCostUsd,
      startedAt: runs.startedAt,
    }).from(runs).where(runWhere).orderBy(desc(runs.startedAt)).limit(10),
  ]);

  const summary = runSummary[0];
  const spendUsd = Number(summary?.spendUsd ?? 0);
  const successCount = Number(summary?.successfulRuns ?? 0);
  return reply({
    data: {
      window: { days, since },
      summary: {
        runCount: Number(summary?.runCount ?? 0),
        spendUsd,
        failedOrAbortedCostUsd: Number(summary?.failedOrAbortedCostUsd ?? 0),
        freshInputTokens: Number(summary?.freshInputTokens ?? 0),
        cacheReadTokens: Number(summary?.cacheReadTokens ?? 0),
        cacheWriteTokens: Number(summary?.cacheWriteTokens ?? 0),
        reasoningTokens: Number(summary?.reasoningTokens ?? 0),
        outputTokens: Number(summary?.outputTokens ?? 0),
        successfulRuns: successCount,
        costPerSuccessfulRunUsd: successCount > 0 ? spendUsd / successCount : null,
      },
      byProvider: providerRows.map((row) => ({ ...row, costUsd: Number(row.costUsd), calls: Number(row.calls) })),
      byModel: modelRows.map((row) => ({ ...row, costUsd: Number(row.costUsd), calls: Number(row.calls) })),
      recentRuns,
    },
  });
}
