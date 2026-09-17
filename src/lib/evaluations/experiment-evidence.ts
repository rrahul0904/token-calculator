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
  qualityScore: string | number | null;
  costUsd: string | number | null;
  success: boolean | null;
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
  };

  if (!Object.values(prerequisites).every(Boolean)) {
    return {
      passed: false,
      evidenceType: "insufficient_evidence" as ExperimentVerificationEvidence,
      prerequisites,
      minimumSampleSize: MINIMUM_EXPERIMENT_EVIDENCE_SAMPLE,
      baseline,
      candidate,
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
  return evaluateExperimentSummaries({
    status: args.status,
    baseline: summarizeExperimentVariant("baseline", args.rows),
    candidate: summarizeExperimentVariant("candidate", args.rows),
    minimumQualityScore: numeric(args.minimumQualityScore),
    maxCostRegressionPct: numeric(args.maxCostRegressionPct),
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
  baseline: ExperimentEvidenceVariant | undefined;
  candidate: ExperimentEvidenceVariant | undefined;
  minimumQualityScore: number | null;
}): ExperimentEvidence {
  if (args.resultCount === 0) return "unavailable";
  const result = evaluateExperimentSummaries({
    status: args.status,
    baseline: args.baseline,
    candidate: args.candidate,
    minimumQualityScore: args.minimumQualityScore,
    maxCostRegressionPct: 0,
  });
  return result.passed ? "experiment_verified" : "results_recorded";
}
