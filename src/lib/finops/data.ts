import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { budgets, projects, runs } from "@/db/schema";
import { costCenterAssignments, projectTeams, providerUsageImports, teams } from "@/db/gap-closure-schema";
import { detectLatestAnomaly, type MetricObservation } from "@/lib/finops/anomalies";
import { allocateShowback, buildWeeklyBrief, forecastMonthEnd, reconcileProviderSpend, type FinanceLedgerRow } from "@/lib/finops/finance";

function money(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function runCost(run: { reconciledCostUsd: string | null; actualCostUsd: string | null; estimatedCostUsd: string | null }) {
  return money(run.reconciledCostUsd) ?? money(run.actualCostUsd) ?? money(run.estimatedCostUsd);
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value ? value : null;
}

export async function getFinopsData(organizationId: string, now = new Date()) {
  const db = getDb();
  const since45 = new Date(now.getTime() - 45 * 86_400_000);
  const [runRows, projectRows, projectTeamRows, teamRows, assignments, importRows, budgetRows] = await Promise.all([
    db.select().from(runs).where(and(eq(runs.organizationId, organizationId), gte(runs.startedAt, since45))).orderBy(desc(runs.startedAt)).limit(5000),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.organizationId, organizationId)),
    db.select().from(projectTeams).where(eq(projectTeams.organizationId, organizationId)),
    db.select().from(teams).where(eq(teams.organizationId, organizationId)),
    db.select().from(costCenterAssignments).where(eq(costCenterAssignments.organizationId, organizationId)),
    db.select().from(providerUsageImports).where(eq(providerUsageImports.organizationId, organizationId)).orderBy(desc(providerUsageImports.periodStart)).limit(100),
    db.select().from(budgets).where(and(eq(budgets.organizationId, organizationId), eq(budgets.enabled, true))),
  ]);

  const projectNames = new Map(projectRows.map((row) => [row.id, row.name]));
  const teamById = new Map(teamRows.map((row) => [row.id, row]));
  const projectTeam = new Map<string, string>();
  for (const row of projectTeamRows) if (!projectTeam.has(row.projectId)) projectTeam.set(row.projectId, row.teamId);
  const costCenter = new Map(assignments.map((row) => [`${row.scopeType}:${row.scopeId}`, row.costCenter]));

  const ledger: FinanceLedgerRow[] = runRows.map((run) => {
    const teamId = run.projectId ? projectTeam.get(run.projectId) ?? null : null;
    const resolvedCostCenter = run.projectId ? costCenter.get(`project:${run.projectId}`) ?? (teamId ? costCenter.get(`team:${teamId}`) ?? teamById.get(teamId)?.costCenter ?? null : null) : null;
    return {
      occurredAt: run.startedAt,
      costUsd: runCost(run),
      status: run.status,
      outcomeStatus: run.outcomeStatus,
      organizationId,
      teamId,
      projectId: run.projectId,
      environment: run.environment,
      userId: run.developerUserId,
      serviceAccountId: run.serviceAccountId,
      apiKeyId: metadataString(run.metadata, "apiKeyId"),
      agent: run.agentName,
      workflow: run.workflowName,
      provider: run.agentVendor,
      model: metadataString(run.metadata, "model"),
      runId: run.id,
      costCenter: resolvedCostCenter,
      cacheReadTokens: run.cacheReadTokens,
      freshInputTokens: run.freshInputTokens,
      retryCount: run.retryCount,
      fallbackPremiumUsd: typeof run.metadata.fallbackPremiumUsd === "number" ? run.metadata.fallbackPremiumUsd : 0,
    };
  });

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthRows = ledger.filter((row) => row.occurredAt >= monthStart);
  const knownMonthSpend = monthRows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0);
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const observedDays = Math.max(1, Math.min(daysInMonth, now.getUTCDate()));
  const orgMonthlyBudget = budgetRows.find((budget) => budget.scopeType === "organization" && budget.period === "month" && budget.limitUsd !== null);
  const forecast = forecastMonthEnd({ spendToDateUsd: knownMonthSpend, observedDays, daysInMonth, budgetUsd: orgMonthlyBudget?.limitUsd ? Number(orgMonthlyBudget.limitUsd) : null });

  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);
  const currentWeek = ledger.filter((row) => row.occurredAt >= sevenDaysAgo);
  const previousWeek = ledger.filter((row) => row.occurredAt >= fourteenDaysAgo && row.occurredAt < sevenDaysAgo);
  const budgetRisks = budgetRows.flatMap((budget) => {
    if (budget.limitUsd === null) return [];
    const limit = Number(budget.limitUsd);
    if (!Number.isFinite(limit) || limit <= 0) return [];
    const scoped = budget.scopeType === "project" && budget.scopeId ? monthRows.filter((row) => row.projectId === budget.scopeId) : budget.scopeType === "team" && budget.scopeId ? monthRows.filter((row) => row.teamId === budget.scopeId) : monthRows;
    const spend = scoped.reduce((sum, row) => sum + (row.costUsd ?? 0), 0);
    return [{ name: budget.name, utilizationPct: spend / limit * 100 }];
  });

  const importedSpend = importRows.filter((row) => row.periodStart >= monthStart).flatMap((row) => row.totalCostUsd === null ? [] : [Number(row.totalCostUsd)]).reduce((sum, value) => sum + value, 0);
  const reconciliation = reconcileProviderSpend({ providerAccountSpendUsd: importRows.some((row) => row.periodStart >= monthStart && row.totalCostUsd !== null) ? importedSpend : null, attributedRunSpendUsd: monthRows.some((row) => row.costUsd !== null) ? knownMonthSpend : null });

  const daily = new Map<string, number>();
  for (const row of ledger) {
    if (row.costUsd === null) continue;
    const key = row.occurredAt.toISOString().slice(0, 10);
    daily.set(key, (daily.get(key) ?? 0) + row.costUsd);
  }
  const dailyObservations: MetricObservation[] = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ periodStart: new Date(`${date}T00:00:00Z`), periodEnd: new Date(`${date}T23:59:59.999Z`), value }));
  const spendAnomaly = detectLatestAnomaly({ metric: "daily_spend_usd", scopeType: "organization", scopeId: organizationId, observations: dailyObservations, minimumAbsoluteChange: 1 });

  const weeklyBrief = buildWeeklyBrief({ current: currentWeek, previous: previousWeek, anomalyCount: spendAnomaly ? 1 : 0, budgetRisks, verifiedSavingsUsd: null });

  return {
    period: { monthStart, now },
    knownMonthSpend,
    unknownCostRuns: monthRows.filter((row) => row.costUsd === null).length,
    forecast,
    showback: {
      project: allocateShowback(monthRows, "project").map((row) => ({ ...row, label: projectNames.get(row.key) ?? row.key })),
      team: allocateShowback(monthRows, "team").map((row) => ({ ...row, label: teamById.get(row.key)?.name ?? row.key })),
      costCenter: allocateShowback(monthRows, "cost_center").map((row) => ({ ...row, label: row.key })),
      provider: allocateShowback(monthRows, "provider").map((row) => ({ ...row, label: row.key })),
    },
    reconciliation,
    weeklyBrief,
    anomaly: spendAnomaly,
  };
}
