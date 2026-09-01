export type RouteEvidenceType = "historically_observed" | "counterfactual_estimate" | "experiment_verified";

export interface HistoricalRouteRun {
  routeId: string;
  provider: string;
  model: string;
  workflow: string;
  contextTokens: number;
  cacheReadShare: number | null;
  costUsd: number | null;
  latencyMs: number | null;
  retries: number;
  fallbacks: number;
  success: boolean | null;
  outcomeVersion?: string | null;
}

export interface RouteCandidateComparison {
  currentRouteId: string;
  candidateRouteId: string;
  workflow: string;
  currentModel: string;
  candidateModel: string;
  currentProvider: string;
  candidateProvider: string;
  currentSampleSize: number;
  candidateSampleSize: number;
  currentSuccessRate: number;
  candidateSuccessRate: number;
  currentMedianCostUsd: number;
  candidateMedianCostUsd: number;
  currentMedianLatencyMs: number | null;
  candidateMedianLatencyMs: number | null;
  estimatedSavingsPct: number;
  evidenceType: RouteEvidenceType;
  confidence: "low" | "medium" | "high";
  recommendation: string;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[index] : (sorted[index - 1] + sorted[index]) / 2;
}

function summarize(rows: HistoricalRouteRun[]) {
  const outcomeRows = rows.filter((row) => row.success !== null);
  const costRows = rows.flatMap((row) => row.costUsd === null ? [] : [row.costUsd]);
  const latencyRows = rows.flatMap((row) => row.latencyMs === null ? [] : [row.latencyMs]);
  return {
    sampleSize: rows.length,
    successRate: outcomeRows.length ? outcomeRows.filter((row) => row.success).length / outcomeRows.length : null,
    medianCostUsd: costRows.length ? median(costRows) : null,
    medianLatencyMs: latencyRows.length ? median(latencyRows) : null,
  };
}

export function compareHistoricalRoutes(args: {
  runs: HistoricalRouteRun[];
  currentRouteId: string;
  workflow: string;
  minimumSampleSize?: number;
  nonInferiorityMargin?: number;
}): RouteCandidateComparison[] {
  const minimumSampleSize = args.minimumSampleSize ?? 5;
  const nonInferiorityMargin = args.nonInferiorityMargin ?? 0.02;
  const cohort = args.runs.filter((run) => run.workflow === args.workflow);
  const currentRows = cohort.filter((run) => run.routeId === args.currentRouteId);
  const current = summarize(currentRows);
  if (current.sampleSize < minimumSampleSize || current.successRate === null || current.medianCostUsd === null) return [];

  const routeIds = [...new Set(cohort.map((run) => run.routeId))].filter((id) => id !== args.currentRouteId);
  return routeIds.flatMap((candidateRouteId) => {
    const candidateRows = cohort.filter((run) => run.routeId === candidateRouteId);
    const candidate = summarize(candidateRows);
    if (candidate.sampleSize < minimumSampleSize || candidate.successRate === null || candidate.medianCostUsd === null) return [];
    if (candidate.successRate + nonInferiorityMargin < current.successRate) return [];
    if (candidate.medianCostUsd >= current.medianCostUsd) return [];
    const currentExample = currentRows[0];
    const candidateExample = candidateRows[0];
    const savings = (current.medianCostUsd - candidate.medianCostUsd) / current.medianCostUsd * 100;
    const combinedSamples = current.sampleSize + candidate.sampleSize;
    const confidence = combinedSamples >= 40 && Math.abs(candidate.successRate - current.successRate) <= 0.01 ? "high" : combinedSamples >= 20 ? "medium" : "low";
    return [{
      currentRouteId: args.currentRouteId,
      candidateRouteId,
      workflow: args.workflow,
      currentModel: currentExample.model,
      candidateModel: candidateExample.model,
      currentProvider: currentExample.provider,
      candidateProvider: candidateExample.provider,
      currentSampleSize: current.sampleSize,
      candidateSampleSize: candidate.sampleSize,
      currentSuccessRate: current.successRate,
      candidateSuccessRate: candidate.successRate,
      currentMedianCostUsd: current.medianCostUsd,
      candidateMedianCostUsd: candidate.medianCostUsd,
      currentMedianLatencyMs: current.medianLatencyMs,
      candidateMedianLatencyMs: candidate.medianLatencyMs,
      estimatedSavingsPct: savings,
      evidenceType: "historically_observed" as const,
      confidence,
      recommendation: "Validate this historically observed route in an approved experiment before changing enforcement policy.",
    }];
  }).sort((a, b) => b.estimatedSavingsPct - a.estimatedSavingsPct);
}

export function selectBestHistoricalRoute(comparisons: RouteCandidateComparison[]) {
  return comparisons[0] ?? null;
}
