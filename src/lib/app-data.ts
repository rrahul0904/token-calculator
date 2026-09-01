import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";

function asMoney(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function runCost(run: { reconciledCostUsd: string | null; actualCostUsd: string | null; estimatedCostUsd: string | null }): number | null {
  return asMoney(run.reconciledCostUsd) ?? asMoney(run.actualCostUsd) ?? asMoney(run.estimatedCostUsd);
}

export async function getOverviewData(organizationId: string) {
  const db = getDb();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [runRows, projectRows] = await Promise.all([
    db.select().from(schema.runs).where(and(eq(schema.runs.organizationId, organizationId), gte(schema.runs.startedAt, since))).orderBy(desc(schema.runs.startedAt)).limit(1000),
    db.select({ id: schema.projects.id, name: schema.projects.name }).from(schema.projects).where(eq(schema.projects.organizationId, organizationId)),
  ]);
  const projectNames = new Map(projectRows.map((project) => [project.id, project.name]));
  const costed = runRows.map((run) => ({ ...run, displayCost: runCost(run) }));
  const knownCosts = costed.flatMap((run) => run.displayCost === null ? [] : [run.displayCost]);
  const spend = knownCosts.reduce((sum, value) => sum + value, 0);
  const failedSpend = costed.filter((run) => ["failed", "aborted", "cancelled", "budget_blocked"].includes(run.status)).reduce((sum, run) => sum + (run.displayCost ?? 0), 0);
  const successful = costed.filter((run) => ["completed", "success", "passed", "merged"].includes(String(run.outcomeStatus ?? "").toLowerCase()) || (run.status === "completed" && run.outcomeStatus === null));
  const fresh = runRows.reduce((sum, run) => sum + run.freshInputTokens, 0);
  const cache = runRows.reduce((sum, run) => sum + run.cacheReadTokens, 0);
  const output = runRows.reduce((sum, run) => sum + run.outputTokens, 0);
  const reasoning = runRows.reduce((sum, run) => sum + run.reasoningTokens, 0);
  const cacheShare = fresh + cache > 0 ? cache / (fresh + cache) : null;

  const provider = new Map<string, number>();
  const project = new Map<string, number>();
  const agent = new Map<string, number>();
  for (const run of costed) {
    if (run.displayCost === null) continue;
    const providerKey = run.agentVendor ?? "Unknown provider";
    provider.set(providerKey, (provider.get(providerKey) ?? 0) + run.displayCost);
    const projectKey = run.projectId ? projectNames.get(run.projectId) ?? "Unknown project" : "Unassigned";
    project.set(projectKey, (project.get(projectKey) ?? 0) + run.displayCost);
    agent.set(run.agentName, (agent.get(run.agentName) ?? 0) + run.displayCost);
  }

  const breakdown = (map: Map<string, number>) => [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  return {
    periodDays: 30,
    runCount: runRows.length,
    spend: knownCosts.length ? spend : null,
    failedSpend: knownCosts.length ? failedSpend : null,
    successfulRuns: successful.length,
    averageCostPerRun: knownCosts.length ? spend / knownCosts.length : null,
    averageCostPerSuccessfulRun: successful.length && knownCosts.length ? spend / successful.length : null,
    tokens: { fresh, cache, reasoning, output },
    cacheShare,
    providerBreakdown: breakdown(provider),
    projectBreakdown: breakdown(project),
    agentBreakdown: breakdown(agent),
    recentRuns: costed.slice(0, 8).map((run) => ({
      id: run.id,
      project: run.projectId ? projectNames.get(run.projectId) ?? "Unknown project" : "Unassigned",
      agentName: run.agentName,
      status: run.status,
      outcomeStatus: run.outcomeStatus,
      usageSource: run.usageSource,
      displayCost: run.displayCost,
      startedAt: run.startedAt,
      retries: run.retryCount,
      fallbacks: run.fallbackCount,
    })),
  };
}

export async function getRunsData(organizationId: string, limit = 100) {
  const db = getDb();
  const rows = await db
    .select({
      run: schema.runs,
      projectName: schema.projects.name,
    })
    .from(schema.runs)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.runs.projectId))
    .where(eq(schema.runs.organizationId, organizationId))
    .orderBy(desc(schema.runs.startedAt))
    .limit(Math.min(Math.max(limit, 1), 250));

  return rows.map(({ run, projectName }) => ({
    ...run,
    projectName: projectName ?? "Unassigned",
    displayCost: runCost(run),
  }));
}

export async function getRunDetail(organizationId: string, runId: string) {
  const db = getDb();
  const runRow = (await db.select().from(schema.runs).where(and(eq(schema.runs.id, runId), eq(schema.runs.organizationId, organizationId))).limit(1))[0];
  if (!runRow) return null;

  const [turnRows, llmRows, toolRows, outcomeRows, decisionRows, findingRows] = await Promise.all([
    db.select().from(schema.turns).where(and(eq(schema.turns.runId, runId), eq(schema.turns.organizationId, organizationId))).orderBy(schema.turns.turnIndex),
    db.select().from(schema.llmCalls).where(and(eq(schema.llmCalls.runId, runId), eq(schema.llmCalls.organizationId, organizationId))).orderBy(schema.llmCalls.startedAt),
    db.select().from(schema.toolCalls).where(and(eq(schema.toolCalls.runId, runId), eq(schema.toolCalls.organizationId, organizationId))).orderBy(schema.toolCalls.startedAt),
    db.select().from(schema.outcomes).where(and(eq(schema.outcomes.runId, runId), eq(schema.outcomes.organizationId, organizationId))).limit(1),
    db.select().from(schema.budgetDecisions).where(and(eq(schema.budgetDecisions.runId, runId), eq(schema.budgetDecisions.organizationId, organizationId))).orderBy(schema.budgetDecisions.decidedAt),
    db.select().from(schema.findings).where(and(eq(schema.findings.runId, runId), eq(schema.findings.organizationId, organizationId))).orderBy(desc(schema.findings.createdAt)),
  ]);

  return {
    run: { ...runRow, displayCost: runCost(runRow) },
    turns: turnRows,
    llmCalls: llmRows,
    toolCalls: toolRows,
    outcome: outcomeRows[0] ?? null,
    decisions: decisionRows,
    findings: findingRows,
  };
}

export async function getProjectsData(organizationId: string) {
  const db = getDb();
  const projectRows = await db.select().from(schema.projects).where(eq(schema.projects.organizationId, organizationId)).orderBy(schema.projects.name);
  const runRows = await db.select().from(schema.runs).where(eq(schema.runs.organizationId, organizationId));
  return projectRows.map((project) => {
    const projectRuns = runRows.filter((run) => run.projectId === project.id);
    const costs = projectRuns.flatMap((run) => {
      const cost = runCost(run);
      return cost === null ? [] : [cost];
    });
    return {
      ...project,
      runCount: projectRuns.length,
      spend: costs.length ? costs.reduce((sum, value) => sum + value, 0) : null,
    };
  });
}
