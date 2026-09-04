import { evaluateRegressionGate } from "@/lib/evaluations/engine";

export const MINIMUM_EXPERIMENT_EVIDENCE_SAMPLE = 5;

export type ExperimentEvidence = "experiment_verified" | "results_recorded" | "unavailable";

export interface ExperimentEvidenceVariant {
  count: number;
  successRate: number | null;
  medianQuality: number | null;
  medianCostUsd: number | null;
}

function completedStatus(status: string) {
  return ["completed", "verified"].includes(status.trim().toLowerCase());
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
  const { baseline, candidate } = args;
  if (!baseline || !candidate || !completedStatus(args.status)) return "results_recorded";
  if (baseline.count < MINIMUM_EXPERIMENT_EVIDENCE_SAMPLE || candidate.count < MINIMUM_EXPERIMENT_EVIDENCE_SAMPLE) return "results_recorded";
  if (baseline.successRate === null || candidate.successRate === null || candidate.successRate < baseline.successRate) return "results_recorded";
  if (baseline.medianQuality === null || candidate.medianQuality === null || baseline.medianCostUsd === null || candidate.medianCostUsd === null) return "results_recorded";
  if (candidate.medianCostUsd >= baseline.medianCostUsd) return "results_recorded";

  const gate = evaluateRegressionGate({
    baseline: { variant: "baseline", qualityScore: baseline.medianQuality, successRate: baseline.successRate, medianCostUsd: baseline.medianCostUsd, sampleSize: baseline.count },
    candidate: { variant: "candidate", qualityScore: candidate.medianQuality, successRate: candidate.successRate, medianCostUsd: candidate.medianCostUsd, sampleSize: candidate.count },
    minimumQualityScore: args.minimumQualityScore ?? undefined,
    maxCostRegressionPct: 0,
  });
  return gate.passed ? "experiment_verified" : "results_recorded";
}
