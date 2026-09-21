import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { findings, llmCalls, outcomes, projects, runs } from "@/db/schema";
import { evaluationDatasets, experimentResults, experiments, verifiedSavings, verifiedSavingsRevalidations } from "@/db/gap-closure-schema";
import { experimentEvidence } from "@/lib/evaluations/experiment-evidence";
import { summarizeOutcomeEconomics } from "@/lib/outcomes/economics";
import { summarizeOrchestrationEconomics } from "@/lib/orchestration/route-lab";

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
  const orchestrationRunIds = [...new Set(callRows.flatMap((call) => {
    const value = call.metadata["orchestration.run_id"];
    return typeof value === "string" && value.trim() ? [value.trim()] : [];
  }))];
  const orchestrationCallRows = orchestrationRunIds.length
    ? await db.select({
      id: llmCalls.id,
      runId: llmCalls.runId,
      costUsd: llmCalls.costUsd,
      costSource: llmCalls.costSource,
      startedAt: llmCalls.startedAt,
      metadata: llmCalls.metadata,
    }).from(llmCalls).where(and(
      eq(llmCalls.organizationId, organizationId),
      inArray(sql<string>`${llmCalls.metadata} ->> 'orchestration.run_id'`, orchestrationRunIds),
    ))
    : [];
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
  const orchestration = summarizeOrchestrationEconomics(orchestrationCallRows);
  return {
    cohorts,
    totalCalls: callRows.length,
    totalRuns: runRows.length,
    observedCohorts: cohorts.filter((cohort) => cohort.evidence === "historically_observed").length,
    orchestration,
  };
}

export async function getExperimentsDashboardData(organizationId: string) {
  const db = getDb();
  const [experimentRows, resultRows, datasetRows, savingsRows, revalidationRows] = await Promise.all([
    db.select().from(experiments).where(eq(experiments.organizationId, organizationId)).orderBy(desc(experiments.updatedAt)).limit(100),
    db.select().from(experimentResults).where(eq(experimentResults.organizationId, organizationId)).orderBy(desc(experimentResults.createdAt)).limit(5000),
    db.select().from(evaluationDatasets).where(eq(evaluationDatasets.organizationId, organizationId)).orderBy(desc(evaluationDatasets.updatedAt)).limit(250),
    db.select().from(verifiedSavings).where(eq(verifiedSavings.organizationId, organizationId)).orderBy(desc(verifiedSavings.verifiedAt)).limit(500),
    db.select().from(verifiedSavingsRevalidations).where(eq(verifiedSavingsRevalidations.organizationId, organizationId)).orderBy(desc(verifiedSavingsRevalidations.checkedAt)).limit(1000),
  ]);
  const datasetById = new Map(datasetRows.map((dataset) => [dataset.id, dataset]));
  const latestSavingsByExperiment = new Map<string, (typeof savingsRows)[number]>();
  for (const savings of savingsRows) if (!latestSavingsByExperiment.has(savings.experimentId)) latestSavingsByExperiment.set(savings.experimentId, savings);
  const latestRevalidationByExperiment = new Map<string, (typeof revalidationRows)[number]>();
  for (const revalidation of revalidationRows) if (!latestRevalidationByExperiment.has(revalidation.experimentId)) latestRevalidationByExperiment.set(revalidation.experimentId, revalidation);
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
    const variants = [...byVariant.entries()].map(([variant, group]) => ({ variant, count: group.count, successRate: group.count ? group.successful / group.count : null, medianCostUsd: median(group.costs), medianQuality: median(group.qualities), medianLatencyMs: median(group.latencies) }));
    const variantByName = new Map(variants.map((variant) => [variant.variant.toLowerCase(), variant]));
    const latestSavings = latestSavingsByExperiment.get(experiment.id);
    const latestRevalidation = latestRevalidationByExperiment.get(experiment.id);
    return {
      ...experiment,
      dataset: datasetById.get(experiment.datasetId) ?? null,
      resultCount: results.length,
      variants,
      evidence: experimentEvidence({
        status: experiment.status,
        resultCount: results.length,
        baseline: variantByName.get("baseline"),
        candidate: variantByName.get("candidate"),
        minimumQualityScore: money(experiment.qualityThreshold),
      }),
      latestVerifiedSavings: latestSavings ? {
        id: latestSavings.id,
        version: latestSavings.version,
        savingsPerObservationUsd: money(latestSavings.savingsPerObservationUsd),
        savingsPct: money(latestSavings.savingsPct),
        baselineSampleSize: latestSavings.baselineSampleSize,
        candidateSampleSize: latestSavings.candidateSampleSize,
        verifiedAt: latestSavings.verifiedAt,
      } : null,
      latestRevalidation: latestRevalidation ? {
        id: latestRevalidation.id,
        status: latestRevalidation.status,
        evidenceType: latestRevalidation.evidenceType,
        checkedAt: latestRevalidation.checkedAt,
        verifiedSavingsId: latestRevalidation.verifiedSavingsId,
      } : null,
    };
  });
  return { items, datasetCount: datasetRows.length, resultCount: resultRows.length, verifiedSavingsCount: savingsRows.length, revalidationCount: revalidationRows.length };
}


export async function getOutcomeEconomicsData(organizationId: string) {
  const db = getDb();
  const [runRows, outcomeRows] = await Promise.all([
    db.select({
      id: runs.id,
      repo: runs.repo,
      agentName: runs.agentName,
      reconciledCostUsd: runs.reconciledCostUsd,
      actualCostUsd: runs.actualCostUsd,
      estimatedCostUsd: runs.estimatedCostUsd,
    }).from(runs).where(eq(runs.organizationId, organizationId)).orderBy(desc(runs.startedAt)).limit(5000),
    db.select().from(outcomes).where(eq(outcomes.organizationId, organizationId)).limit(5000),
  ]);
  const outcomeByRunId = new Map(outcomeRows.map((outcome) => [outcome.runId, outcome]));
  return summarizeOutcomeEconomics(runRows.map((run) => {
    const outcome = outcomeByRunId.get(run.id);
    return {
      runId: run.id,
      repo: run.repo,
      agentName: run.agentName,
      reconciledCostUsd: money(run.reconciledCostUsd),
      actualCostUsd: money(run.actualCostUsd),
      estimatedCostUsd: money(run.estimatedCostUsd),
      outcome: outcome ? {
        taskCompleted: outcome.taskCompleted,
        testsPassed: outcome.testsPassed,
        prNumber: outcome.prNumber,
        ciPassed: outcome.ciPassed,
        ciProvider: outcome.ciProvider,
        ciRunId: outcome.ciRunId,
        merged: outcome.merged,
        deploymentSuccessful: outcome.deploymentSuccessful,
        deploymentProvider: outcome.deploymentProvider,
        deploymentId: outcome.deploymentId,
        deploymentEnvironment: outcome.deploymentEnvironment,
        associationConfidence: money(outcome.associationConfidence),
      } : null,
    };
  }));
}
