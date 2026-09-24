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

function safeRatio(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return Math.min(Math.max(numerator / denominator, 0), 1);
}

function variantRows(rows: ExperimentEvidenceRow[], variant: "baseline" | "candidate") {
  return rows.filter((row) => row.variant.trim().toLowerCase() === variant);
}

function caseId(row: ExperimentEvidenceRow) {
  const value = row.caseId?.trim();
  return value ? value : null;
}

function uniqueCaseIds(rows: ExperimentEvidenceRow[]) {
  return new Set(rows.flatMap((row) => {
    const value = caseId(row);
    return value ? [value] : [];
  }));
}

function hasDuplicateCases(rows: ExperimentEvidenceRow[]) {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = caseId(row);
    if (!value) continue;
    if (seen.has(value)) return true;
    seen.add(value);
  }
  return false;
}

function authoritativeFullSession(row: ExperimentEvidenceRow) {
  const source = String(row.economicsSource ?? "").trim().toLowerCase();
  const scope = String(row.measurementScope ?? "").trim().toLowerCase();
  return ["linked_run", "orchestration_calls"].includes(source)
    && ["full_session", "orchestration_full_session"].includes(scope);
}

function contextNumber(row: ExperimentEvidenceRow, key: string) {
  const value = row.benchmarkContext?.[key];
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function benchmarkIntegrity(rows: ExperimentEvidenceRow[]) {
  const baseline = variantRows(rows, "baseline");
  const candidate = variantRows(rows, "candidate");
  const baselineCases = uniqueCaseIds(baseline);
  const candidateCases = uniqueCaseIds(candidate);
  const pairedCases = [...baselineCases].filter((value) => candidateCases.has(value));
  const noDuplicateCases = !hasDuplicateCases(baseline) && !hasDuplicateCases(candidate);
  const allRowsCaseLinked = rows.length > 0 && rows.every((row) => caseId(row) !== null);
  const sameCaseCohort = allRowsCaseLinked
    && noDuplicateCases
    && baseline.length === candidate.length
    && baselineCases.size === baseline.length
    && candidateCases.size === candidate.length
    && pairedCases.length === baseline.length;

  const authoritativeRows = rows.filter(authoritativeFullSession);
  const fullSessionEconomics = rows.length > 0 && authoritativeRows.length === rows.length;
  const cacheAccountingRows = rows.filter((row) =>
    contextNumber(row, "cache_read_tokens") !== null
    && contextNumber(row, "cache_write_tokens") !== null);
  const toolAccountingRows = rows.filter((row) => contextNumber(row, "tool_call_count") !== null);
  const indexTimeRows = rows.filter((row) => contextNumber(row, "index_time_ms") !== null);
  const agentToolUseRows = rows.filter((row) => (contextNumber(row, "tool_call_count") ?? 0) > 0);
  const targetToolAccountingRows = rows.filter((row) => contextNumber(row, "target_tool_call_count") !== null);
  const targetToolInvokedRows = targetToolAccountingRows.filter((row) => (contextNumber(row, "target_tool_call_count") ?? 0) > 0);
  const retrievalDiagnostics = rows.flatMap((row) => {
    const goldTotal = contextNumber(row, "gold_files_total");
    const goldFound = contextNumber(row, "gold_files_found");
    const filesServed = contextNumber(row, "files_served");
    const coverage = safeRatio(goldFound, goldTotal);
    const precision = safeRatio(goldFound, filesServed);
    return coverage === null || precision === null ? [] : [{ coverage, precision, filesServed: filesServed! }];
  });

  return {
    pairedCaseCount: pairedCases.length,
    baselineUniqueCaseCount: baselineCases.size,
    candidateUniqueCaseCount: candidateCases.size,
    sameCaseCohort,
    noDuplicateCases,
    authoritativeFullSessionCount: authoritativeRows.length,
    authoritativeFullSessionEconomics: fullSessionEconomics,
    cacheAccountingCount: cacheAccountingRows.length,
    cacheAccountingComplete: rows.length > 0 && cacheAccountingRows.length === rows.length,
    toolCallAccountingCount: toolAccountingRows.length,
    toolCallAccountingComplete: rows.length > 0 && toolAccountingRows.length === rows.length,
    agentToolUseRate: rows.length ? agentToolUseRows.length / rows.length : null,
    targetToolAccountingCount: targetToolAccountingRows.length,
    targetToolInvocationRate: targetToolAccountingRows.length ? targetToolInvokedRows.length / targetToolAccountingRows.length : null,
    retrievalDiagnosticsCount: retrievalDiagnostics.length,
    medianRetrievalCoverage: median(retrievalDiagnostics.map((item) => item.coverage)),
    medianRetrievalPrecision: median(retrievalDiagnostics.map((item) => item.precision)),
    medianFilesServed: median(retrievalDiagnostics.map((item) => item.filesServed)),
    indexTimeReportedCount: indexTimeRows.length,
    indexTimeCoverage: rows.length ? indexTimeRows.length / rows.length : null,
  };
}

export function summarizeExperimentVariant(variant: "baseline" | "candidate", rows: ExperimentEvidenceRow[]): ExperimentEvidenceVariant {
  const selected = variantRows(rows, variant);
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
  const integrity = args.integrity ?? null;
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
    pairedCaseCohort: Boolean(integrity?.sameCaseCohort && integrity.pairedCaseCount >= MINIMUM_EXPERIMENT_EVIDENCE_SAMPLE),
    fullSessionEconomics: Boolean(integrity?.authoritativeFullSessionEconomics),
    cacheAccounting: Boolean(integrity?.cacheAccountingComplete),
    toolCallAccounting: Boolean(integrity?.toolCallAccountingComplete),
  };

  if (!Object.values(prerequisites).every(Boolean)) {
    return {
      passed: false,
      evidenceType: "insufficient_evidence" as ExperimentVerificationEvidence,
      prerequisites,
      minimumSampleSize: MINIMUM_EXPERIMENT_EVIDENCE_SAMPLE,
      baseline,
      candidate,
      benchmarkIntegrity: integrity,
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
    benchmarkIntegrity: integrity,
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
 * paired cases, full-session authoritative economics, explicit cache/tool-call
 * accounting, enough observations, non-inferior quality and success, and lower cost.
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
