import { evaluateRegressionGate } from "@/lib/evaluations/engine";

export const MINIMUM_EXPERIMENT_EVIDENCE_SAMPLE = 5;

export type ExperimentEvidence = "experiment_verified" | "results_recorded" | "unavailable";
export type ExperimentVerificationEvidence = "experiment_verified" | "experiment_rejected" | "insufficient_evidence";

export interface ExperimentEvidenceVariant {
  count: number;
  successRate: number | null;
  medianQuality: number | null;
  medianCostUsd: number | null;
}

export interface ExperimentEvidenceRow {
  variant: string;
  caseId?: string | null;
  runId?: string | null;
  qualityScore: string | number | null;
  costUsd: string | number | null;
  success: boolean | null;
  economicsSource?: string | null;
  measurementScope?: string | null;
  benchmarkContext?: Record<string, unknown> | null;
}

function completedStatus(status: string) {
  return ["completed", "verified"].includes(status.trim().toLowerCase());
}

function numeric(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function contextNumber(row: ExperimentEvidenceRow, key: string) {
  const value = row.benchmarkContext?.[key];
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function terminalSessionEvidence(row: ExperimentEvidenceRow) {
  const status = String(row.benchmarkContext?.run_status ?? "").trim().toLowerCase();
  const endedAt = row.benchmarkContext?.run_ended_at;
  const hasEndTime = typeof endedAt === "string" && Number.isFinite(Date.parse(endedAt))
    || endedAt instanceof Date && Number.isFinite(endedAt.getTime());
  return ["completed", "failed", "aborted", "cancelled", "budget_blocked"].includes(status)
    && hasEndTime
    && row.benchmarkContext?.session_runs_terminal === true;
}

function benchmarkIntegrity(rows: ExperimentEvidenceRow[]) {
  const baseline = rows.filter((row) => row.variant.trim().toLowerCase() === "baseline");
  const candidate = rows.filter((row) => row.variant.trim().toLowerCase() === "candidate");
  const baselineCases = baseline.map((row) => row.caseId?.trim() || "");
  const candidateCases = candidate.map((row) => row.caseId?.trim() || "");
  const uniqueBaseline = new Set(baselineCases.filter(Boolean));
  const uniqueCandidate = new Set(candidateCases.filter(Boolean));
  const runIds = rows.map((row) => row.runId?.trim() || "");
  const uniqueRunIds = new Set(runIds.filter(Boolean));
  const pairedCaseCount = [...uniqueBaseline].filter((id) => uniqueCandidate.has(id)).length;
  const noDuplicates = uniqueBaseline.size === baseline.length && uniqueCandidate.size === candidate.length;
  const noDuplicateRuns = runIds.length === rows.length && runIds.every(Boolean) && uniqueRunIds.size === rows.length;
  const sameCaseCohort = rows.length > 0
    && baseline.length > 0
    && candidate.length > 0
    && baseline.length === candidate.length
    && noDuplicates
    && noDuplicateRuns
    && baselineCases.every(Boolean)
    && candidateCases.every(Boolean)
    && pairedCaseCount === baseline.length;
  const fullSessionRows = rows.filter((row) =>
    ["linked_run", "orchestration_calls"].includes(String(row.economicsSource ?? "").trim().toLowerCase())
    && ["full_session", "orchestration_full_session"].includes(String(row.measurementScope ?? "").trim().toLowerCase())
    && numeric(row.costUsd) !== null
    && numeric(row.costUsd)! >= 0
    && numeric(row.qualityScore) !== null
    && row.success !== null
    && terminalSessionEvidence(row));
  const cacheRows = rows.filter((row) => contextNumber(row, "cache_read_tokens") !== null && contextNumber(row, "cache_write_tokens") !== null);
  const toolRows = rows.filter((row) => contextNumber(row, "tool_call_count") !== null);
  const targetRows = rows.filter((row) => typeof row.benchmarkContext?.target_tool === "string" && contextNumber(row, "target_tool_call_count") !== null);
  const targetInvocations = targetRows.filter((row) => contextNumber(row, "target_tool_call_count")! > 0).length;
  const indexRows = rows.filter((row) => contextNumber(row, "index_time_ms") !== null);
  const retrievalRows = rows.flatMap((row) => {
    const total = contextNumber(row, "gold_files_total");
    const found = contextNumber(row, "gold_files_found");
    const served = contextNumber(row, "files_served");
    return total && served !== null && found !== null
      ? [{ coverage: Math.min(found / total, 1), precision: served > 0 ? Math.min(found / served, 1) : null, served }]
      : [];
  });
  const median = (values: number[]) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  return {
    pairedCaseCount,
    sameCaseCohort,
    noDuplicateCases: noDuplicates,
    noDuplicateRuns,
    authoritativeFullSessionCount: fullSessionRows.length,
    authoritativeFullSessionEconomics: rows.length > 0 && fullSessionRows.length === rows.length,
    cacheAccountingComplete: rows.length > 0 && cacheRows.length === rows.length,
    toolCallAccountingComplete: rows.length > 0 && toolRows.length === rows.length,
    targetToolAccountingCount: targetRows.length,
    targetToolInvocationRate: targetRows.length ? targetInvocations / targetRows.length : null,
    indexTimeReportedCount: indexRows.length,
    indexTimeCoverage: rows.length ? indexRows.length / rows.length : null,
    retrievalDiagnosticsCount: retrievalRows.length,
    medianRetrievalCoverage: median(retrievalRows.map((row) => row.coverage)),
    medianRetrievalPrecision: median(retrievalRows.flatMap((row) => row.precision === null ? [] : [row.precision])),
    medianFilesServed: median(retrievalRows.map((row) => row.served)),
  };
}

export function summarizeExperimentVariant(variant: "baseline" | "candidate", rows: ExperimentEvidenceRow[]): ExperimentEvidenceVariant {
  const selected = rows.filter((row) => row.variant.toLowerCase() === variant);
  const qualities = selected.flatMap((row) => {
    const value = numeric(row.qualityScore);
    return value === null ? [] : [value];
  });
  const costs = selected.flatMap((row) => {
    const value = numeric(row.costUsd);
    return value === null ? [] : [value];
  });
  const observedSuccess = selected.filter((row) => row.success !== null);
  return {
    count: selected.length,
    successRate: observedSuccess.length ? observedSuccess.filter((row) => row.success).length / observedSuccess.length : null,
    medianQuality: median(qualities),
    medianCostUsd: median(costs),
  };
}

export function evaluateExperimentSummaries(args: {
  status: string;
  baseline: ExperimentEvidenceVariant | undefined;
  candidate: ExperimentEvidenceVariant | undefined;
  minimumQualityScore: number | null;
  maxCostRegressionPct?: number | null;
  integrity?: ReturnType<typeof benchmarkIntegrity> | null;
}) {
  const baseline = args.baseline ?? { count: 0, successRate: null, medianQuality: null, medianCostUsd: null };
  const candidate = args.candidate ?? { count: 0, successRate: null, medianQuality: null, medianCostUsd: null };
  const prerequisites = {
    experimentCompleted: completedStatus(args.status),
    baselineSample: baseline.count >= MINIMUM_EXPERIMENT_EVIDENCE_SAMPLE,
    candidateSample: candidate.count >= MINIMUM_EXPERIMENT_EVIDENCE_SAMPLE,
    baselineQuality: baseline.medianQuality !== null,
    candidateQuality: candidate.medianQuality !== null,
    baselineCost: baseline.medianCostUsd !== null,
    candidateCost: candidate.medianCostUsd !== null,
    baselineSuccess: baseline.successRate !== null,
    candidateSuccess: candidate.successRate !== null,
    pairedCaseCohort: Boolean(args.integrity?.sameCaseCohort && args.integrity.pairedCaseCount >= MINIMUM_EXPERIMENT_EVIDENCE_SAMPLE),
    independentRuns: Boolean(args.integrity?.noDuplicateRuns),
    fullSessionEconomics: Boolean(args.integrity?.authoritativeFullSessionEconomics),
    cacheAccounting: Boolean(args.integrity?.cacheAccountingComplete),
    toolCallAccounting: Boolean(args.integrity?.toolCallAccountingComplete),
  };

  if (!Object.values(prerequisites).every(Boolean)) {
    return {
      passed: false,
      evidenceType: "insufficient_evidence" as ExperimentVerificationEvidence,
      prerequisites,
      minimumSampleSize: MINIMUM_EXPERIMENT_EVIDENCE_SAMPLE,
      baseline,
      candidate,
      benchmarkIntegrity: args.integrity ?? null,
      qualityGate: null,
      successPassed: false,
      costImproved: false,
      savings: null,
    };
  }

  const qualityGate = evaluateRegressionGate({
    baseline: {
      variant: "baseline",
      qualityScore: baseline.medianQuality!,
      successRate: baseline.successRate!,
      medianCostUsd: baseline.medianCostUsd!,
      sampleSize: baseline.count,
    },
    candidate: {
      variant: "candidate",
      qualityScore: candidate.medianQuality!,
      successRate: candidate.successRate!,
      medianCostUsd: candidate.medianCostUsd!,
      sampleSize: candidate.count,
    },
    minimumQualityScore: args.minimumQualityScore ?? undefined,
    maxCostRegressionPct: args.maxCostRegressionPct ?? 0,
  });
  const successPassed = candidate.successRate! >= baseline.successRate!;
  const costImproved = candidate.medianCostUsd! < baseline.medianCostUsd!;
  const passed = qualityGate.passed && successPassed && costImproved;
  const savingsPerObservationUsd = Math.max(baseline.medianCostUsd! - candidate.medianCostUsd!, 0);
  const savingsPct = baseline.medianCostUsd! > 0 ? savingsPerObservationUsd / baseline.medianCostUsd! * 100 : null;

  return {
    passed,
    evidenceType: (passed ? "experiment_verified" : "experiment_rejected") as ExperimentVerificationEvidence,
    prerequisites,
    minimumSampleSize: MINIMUM_EXPERIMENT_EVIDENCE_SAMPLE,
    baseline,
    candidate,
    benchmarkIntegrity: args.integrity ?? null,
    qualityGate,
    successPassed,
    costImproved,
    savings: passed ? { savingsPerObservationUsd, savingsPct } : null,
  };
}

export function evaluateExperimentRows(args: {
  status: string;
  rows: ExperimentEvidenceRow[];
  minimumQualityScore: string | number | null;
  maxCostRegressionPct?: string | number | null;
}) {
  const integrity = benchmarkIntegrity(args.rows);
  return evaluateExperimentSummaries({
    status: args.status,
    baseline: summarizeExperimentVariant("baseline", args.rows),
    candidate: summarizeExperimentVariant("candidate", args.rows),
    minimumQualityScore: numeric(args.minimumQualityScore),
    maxCostRegressionPct: numeric(args.maxCostRegressionPct),
    integrity,
  });
}

/**
 * A recorded experiment is not a verified savings claim. Verification requires
 * completed, controlled baseline/candidate evidence with enough observations,
 * non-inferior quality and success, and strictly lower candidate cost.
 */
export function experimentEvidence(args: {
  status: string;
  resultCount: number;
  rows?: ExperimentEvidenceRow[];
  baseline?: ExperimentEvidenceVariant;
  candidate?: ExperimentEvidenceVariant;
  minimumQualityScore: number | null;
}): ExperimentEvidence {
  if (args.resultCount === 0) return "unavailable";
  if (!args.rows) return "results_recorded";
  const result = evaluateExperimentRows({
    status: args.status,
    rows: args.rows,
    minimumQualityScore: args.minimumQualityScore,
    maxCostRegressionPct: 0,
  });
  return result.passed ? "experiment_verified" : "results_recorded";
}
