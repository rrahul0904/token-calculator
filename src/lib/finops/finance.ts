export interface FinanceLedgerRow {
  occurredAt: Date;
  costUsd: number | null;
  status: string;
  outcomeStatus?: string | null;
  organizationId: string;
  teamId?: string | null;
  projectId?: string | null;
  environment?: string | null;
  userId?: string | null;
  serviceAccountId?: string | null;
  apiKeyId?: string | null;
  agent?: string | null;
  workflow?: string | null;
  provider?: string | null;
  model?: string | null;
  runId?: string | null;
  costCenter?: string | null;
  cacheReadTokens?: number;
  freshInputTokens?: number;
  retryCount?: number;
  fallbackPremiumUsd?: number;
}

export type FinanceDimension = "organization" | "team" | "project" | "environment" | "user" | "service_account" | "api_key" | "agent" | "workflow" | "provider" | "model" | "run" | "outcome" | "cost_center";

function dimensionValue(row: FinanceLedgerRow, dimension: FinanceDimension) {
  const value = dimension === "organization" ? row.organizationId
    : dimension === "team" ? row.teamId
      : dimension === "project" ? row.projectId
        : dimension === "environment" ? row.environment
          : dimension === "user" ? row.userId
            : dimension === "service_account" ? row.serviceAccountId
              : dimension === "api_key" ? row.apiKeyId
                : dimension === "agent" ? row.agent
                  : dimension === "workflow" ? row.workflow
                    : dimension === "provider" ? row.provider
                      : dimension === "model" ? row.model
                        : dimension === "run" ? row.runId
                          : dimension === "outcome" ? row.outcomeStatus
                            : row.costCenter;
  return value || "unassigned";
}

export function allocateShowback(rows: FinanceLedgerRow[], dimension: FinanceDimension) {
  const groups = new Map<string, { knownSpendUsd: number; knownRows: number; unknownCostRows: number; runCount: number }>();
  for (const row of rows) {
    const key = dimensionValue(row, dimension);
    const group = groups.get(key) ?? { knownSpendUsd: 0, knownRows: 0, unknownCostRows: 0, runCount: 0 };
    group.runCount += 1;
    if (row.costUsd === null) group.unknownCostRows += 1;
    else { group.knownSpendUsd += row.costUsd; group.knownRows += 1; }
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, value]) => ({ key, ...value })).sort((a, b) => b.knownSpendUsd - a.knownSpendUsd);
}

export function forecastMonthEnd(args: { spendToDateUsd: number; observedDays: number; daysInMonth: number; budgetUsd?: number | null }) {
  const observedDays = Math.max(1, Math.min(args.daysInMonth, args.observedDays));
  const dailyRate = args.spendToDateUsd / observedDays;
  const projectedMonthEndUsd = dailyRate * args.daysInMonth;
  const completionPct = observedDays / args.daysInMonth;
  const confidence = completionPct >= 0.75 ? "high" : completionPct >= 0.35 ? "medium" : "low";
  return {
    currentPeriodSpendUsd: args.spendToDateUsd,
    projectedMonthEndUsd,
    budgetUsd: args.budgetUsd ?? null,
    varianceUsd: args.budgetUsd == null ? null : projectedMonthEndUsd - args.budgetUsd,
    confidence,
    method: "linear_daily_run_rate" as const,
    observedDays,
    daysInMonth: args.daysInMonth,
  };
}

export function reconcileProviderSpend(args: { providerAccountSpendUsd: number | null; attributedRunSpendUsd: number | null }) {
  const provider = args.providerAccountSpendUsd;
  const attributed = args.attributedRunSpendUsd;
  if (provider === null) return { providerAccountSpendUsd: null, attributedRunSpendUsd: attributed, unattributedDifferenceUsd: null, reconciliationCoveragePct: null };
  const difference = attributed === null ? provider : provider - attributed;
  const coverage = attributed === null || provider <= 0 ? null : Math.max(0, Math.min(100, attributed / provider * 100));
  return { providerAccountSpendUsd: provider, attributedRunSpendUsd: attributed, unattributedDifferenceUsd: difference, reconciliationCoveragePct: coverage };
}

export function buildWeeklyBrief(args: { current: FinanceLedgerRow[]; previous: FinanceLedgerRow[]; anomalyCount: number; budgetRisks: Array<{ name: string; utilizationPct: number }>; verifiedSavingsUsd?: number | null }) {
  const known = (rows: FinanceLedgerRow[]) => rows.flatMap((row) => row.costUsd === null ? [] : [row.costUsd]).reduce((sum, value) => sum + value, 0);
  const currentSpend = known(args.current);
  const previousSpend = known(args.previous);
  const changeUsd = currentSpend - previousSpend;
  const failedSpend = args.current.filter((row) => ["failed", "aborted", "cancelled", "budget_blocked"].includes(row.status)).reduce((sum, row) => sum + (row.costUsd ?? 0), 0);
  const retries = args.current.reduce((sum, row) => sum + (row.retryCount ?? 0), 0);
  const fallbackPremiumUsd = args.current.reduce((sum, row) => sum + (row.fallbackPremiumUsd ?? 0), 0);
  const cacheRead = args.current.reduce((sum, row) => sum + (row.cacheReadTokens ?? 0), 0);
  const fresh = args.current.reduce((sum, row) => sum + (row.freshInputTokens ?? 0), 0);
  const providerDrivers = allocateShowback(args.current, "provider").slice(0, 3);
  return {
    periodSpendUsd: currentSpend,
    previousPeriodSpendUsd: previousSpend,
    changeUsd,
    changePct: previousSpend > 0 ? changeUsd / previousSpend * 100 : null,
    largestDrivers: providerDrivers,
    anomalyCount: args.anomalyCount,
    budgetRisks: [...args.budgetRisks].sort((a, b) => b.utilizationPct - a.utilizationPct),
    failedAbortedSpendUsd: failedSpend,
    retryCount: retries,
    fallbackPremiumUsd,
    cacheReadShare: cacheRead + fresh > 0 ? cacheRead / (cacheRead + fresh) : null,
    verifiedSavingsUsd: args.verifiedSavingsUsd ?? null,
    generatedBy: "deterministic_finops_brief" as const,
  };
}
