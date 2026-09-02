import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { findings, llmCalls, projects, runs } from "@/db/schema";
import { evaluationDatasets, experimentResults, experiments } from "@/db/gap-closure-schema";

function money(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function successStatus(status: string | null, runStatus: string) {
  const normalized = String(status ?? "").toLowerCase();
  return ["completed", "success", "passed", "merged", "verified"].includes(normalized) || (!normalized && runStatus === "completed");
}

export async function getFindingsDashboardData(organizationId: string) {
  const db = getDb();
  const [findingRows, runRows, projectRows] = await Promise.all([
    db.select().from(findings).where(eq(findings.organizationId, organizationId)).orderBy(desc(findings.createdAt)).limit(250),
    db.select({ id: runs.id, projectId: runs.projectId, agentName: runs.agentName, status: runs.status, outcomeStatus: runs.outcomeStatus, startedAt: runs.startedAt }).from(runs).where(eq(runs.organizationId, organizationId)).orderBy(desc(runs.startedAt)).limit(500),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.organizationId, organizationId)),
  ]);
  const runById = new Map(runRows.map((run) => [run.id, run]));
  const projectById = new Map(projectRows.map((project) => [project.id, project.name]));
  const rows = findingRows.map((finding) => {
    const run = runById.get(finding.runId);
    return {
      ...finding,
      estimatedWasteUsdValue: money(finding.estimatedWasteUsd),
      agentName: run?.agentName ?? "Unknown agent",
      runStatus: run?.status ?? "unknown",
      outcomeStatus: run?.outcomeStatus ?? null,
      projectName: run?.projectId ? projectById.get(run.projectId) ?? "Unknown project" : "Unassigned",
      runStartedAt: run?.startedAt ?? finding.createdAt,
    };
  });
  const knownWaste = rows.flatMap((row) => row.estimatedWasteUsdValue === null ? [] : [row.estimatedWasteUsdValue]);
  const byRule = new Map<string, number>();
  for (const row of rows) byRule.set(row.ruleId, (byRule.get(row.ruleId) ?? 0) + 1);
  return {
    rows,
    total: rows.length,
    affectedRuns: new Set(rows.map((row) => row.runId)).size,
    estimatedWasteTokens: rows.reduce((sum, row) => sum + (row.estimatedWasteTokens ?? 0), 0),
    estimatedWasteUsd: knownWaste.length ? knownWaste.reduce((sum, value) => sum + value, 0) : null,
    severeCount: rows.filter((row) => ["high", "critical"].includes(row.severity.toLowerCase())).length,
    byRule: [...byRule.entries()].map(([ruleId, count]) => ({ ruleId, count })).sort((a, b) => b.count - a.count),
  };
}

export async function getRouteLabData(organizationId: string) {
  const db = getDb();
  const since = new Date(Date.now() - 45 * 86_400_000);
  const [callRows, runRows] = await Promise.all([
    db.select().from(llmCalls).where(and(eq(llmCalls.organizationId, organizationId), gte(llmCalls.startedAt, since))).orderBy(desc(llmCalls.startedAt)).limit(2500),
    db.select({ id: runs.id, status: runs.status, outcomeStatus: runs.outcomeStatus, workflowName: runs.workflowName }).from(runs).where(and(eq(runs.organizationId, organizationId), gte(runs.startedAt, since))).limit(2500),
  ]);
  const runById = new Map(runRows.map((run) => [run.id, run]));
  const groups = new Map<string, { provider: string; model: string; calls: number; runIds: Set<string>; successfulRunIds: Set<string>; costs: number[]; latencies: number[]; retries: number }>();
  for (const call of callRows) {
    const model = call.modelResolved ?? call.modelRequested ?? "Unknown model";
    const key = `${call.provider}::${model}`;
    const group = groups.get(key) ?? { provider: call.provider, model, calls: 0, runIds: new Set<string>(), successfulRunIds: new Set<string>(), costs: [], latencies: [], retries: 0 };
    group.calls += 1;
    group.runIds.add(call.runId);
    const run = runById.get(call.runId);
    if (run && successStatus(run.outcomeStatus, run.status)) group.successfulRunIds.add(call.runId);
    const cost = money(call.costUsd);
    if (cost !== null) group.costs.push(cost);
    if (call.latencyMs !== null) group.latencies.push(call.latencyMs);
    if (call.attemptIndex > 0) group.retries += 1;
    groups.set(key, group);
  }
  const cohorts = [...groups.values()].map((group) => ({
    provider: group.provider,
    model: group.model,
    callCount: group.calls,
    runCount: group.runIds.size,
    successRate: group.runIds.size ? group.successfulRunIds.size / group.runIds.size : null,
    medianCallCostUsd: median(group.costs),
    medianLatencyMs: median(group.latencies),
    retryRate: group.calls ? group.retries / group.calls : null,
    evidence: group.runIds.size >= 5 ? "historically_observed" as const : "insufficient_sample" as const,
  })).sort((a, b) => b.runCount - a.runCount || (a.medianCallCostUsd ?? Number.POSITIVE_INFINITY) - (b.medianCallCostUsd ?? Number.POSITIVE_INFINITY));
  return { cohorts, totalCalls: callRows.length, totalRuns: runRows.length, observedCohorts: cohorts.filter((cohort) => cohort.evidence === "historically_observed").length };
}

export async function getExperimentsDashboardData(organizationId: string) {
  const db = getDb();
  const [experimentRows, resultRows, datasetRows] = await Promise.all([
    db.select().from(experiments).where(eq(experiments.organizationId, organizationId)).orderBy(desc(experiments.updatedAt)).limit(100),
    db.select().from(experimentResults).where(eq(experimentResults.organizationId, organizationId)).orderBy(desc(experimentResults.createdAt)).limit(5000),
    db.select().from(evaluationDatasets).where(eq(evaluationDatasets.organizationId, organizationId)).orderBy(desc(evaluationDatasets.updatedAt)).limit(250),
  ]);
  const datasetById = new Map(datasetRows.map((dataset) => [dataset.id, dataset]));
  const items = experimentRows.map((experiment) => {
    const results = resultRows.filter((result) => result.experimentId === experiment.id);
    const byVariant = new Map<string, { count: number; successful: number; costs: number[]; qualities: number[]; latencies: number[] }>();
    for (const result of results) {
      const group = byVariant.get(result.variant) ?? { count: 0, successful: 0, costs: [], qualities: [], latencies: [] };
      group.count += 1;
      if (result.success) group.successful += 1;
      const cost = money(result.costUsd);
      if (cost !== null) group.costs.push(cost);
      const quality = money(result.qualityScore);
      if (quality !== null) group.qualities.push(quality);
      if (result.latencyMs !== null) group.latencies.push(result.latencyMs);
      byVariant.set(result.variant, group);
    }
    return {
      ...experiment,
      dataset: datasetById.get(experiment.datasetId) ?? null,
      resultCount: results.length,
      variants: [...byVariant.entries()].map(([variant, group]) => ({ variant, count: group.count, successRate: group.count ? group.successful / group.count : null, medianCostUsd: median(group.costs), medianQuality: median(group.qualities), medianLatencyMs: median(group.latencies) })),
      evidence: results.length ? "experiment_verified" as const : "unavailable" as const,
    };
  });
  return { items, datasetCount: datasetRows.length, resultCount: resultRows.length };
}
