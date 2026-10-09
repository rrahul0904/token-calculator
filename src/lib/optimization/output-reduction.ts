export type OutputReductionMeasurementScope = "payload_only" | "full_session";
export type OutputReductionEvidenceType = "measured_before_after" | "historical_observation" | "modeled_estimate" | "unknown";
export type OutputReductionQualityGate = "passed" | "failed" | "not_run";

export type OutputReductionStatus =
  | "verified_savings"
  | "payload_reduction_only"
  | "candidate"
  | "insufficient_samples"
  | "quality_unverified"
  | "quality_regression"
  | "signal_loss"
  | "token_regression"
  | "no_savings_evidence";

export interface OutputReductionCandidate {
  id: string;
  label?: string;
  reducerVersion?: string | null;
  measurementScope: OutputReductionMeasurementScope;
  evidenceType: OutputReductionEvidenceType;
  qualityGate: OutputReductionQualityGate;
  sampleSize: number;
  baselineTokens: number | null;
  deliveredTokens: number | null;
  retryTokens?: number | null;
  reducerOverheadTokens?: number | null;
  requiredSignals?: string[];
  preservedSignals?: string[];
  fallbackReason?: string | null;
  evidenceSource?: string | null;
}

export interface OutputReductionEvaluation {
  id: string;
  label: string;
  reducerVersion: string | null;
  status: OutputReductionStatus;
  claimable: boolean;
  measurementScope: OutputReductionMeasurementScope;
  evidenceType: OutputReductionEvidenceType;
  qualityGate: OutputReductionQualityGate;
  sampleSize: number;
  baselineTokens: number | null;
  deliveredTokens: number | null;
  retryTokens: number;
  reducerOverheadTokens: number;
  netCandidateTokens: number | null;
  measuredSavingsTokens: number | null;
  measuredSavingsPct: number | null;
  requiredSignals: string[];
  preservedSignals: string[];
  missingSignals: string[];
  fallbackReason: string | null;
  evidenceSource: string | null;
  verificationRequired: string | null;
}

function normalizeNullableTokens(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeTokens(value: number | null | undefined): number {
  return normalizeNullableTokens(value) ?? 0;
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function uniqueSignals(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function verificationRequired(
  candidate: OutputReductionCandidate,
  evaluation: Pick<OutputReductionEvaluation, "status" | "missingSignals">,
  minimumSampleSize: number,
): string | null {
  switch (evaluation.status) {
    case "verified_savings":
      return null;
    case "signal_loss":
      return `Preserve all required decision signals before adoption: ${evaluation.missingSignals.join(", ")}.`;
    case "quality_regression":
      return "Fix the task-quality regression and repeat the same versioned workload.";
    case "token_regression":
      return "Investigate retries and reducer overhead; the candidate consumed more net tokens than the baseline.";
    case "payload_reduction_only":
      return "Measure the same workload end to end. Payload shrinkage alone cannot prove full-session token savings.";
    case "quality_unverified":
      return "Run an outcome-equivalent quality gate on the same versioned workload.";
    case "insufficient_samples":
      return `Collect at least ${minimumSampleSize} comparable measured full-session samples.`;
    case "candidate":
      return "Capture measured before/after full-session token evidence; estimates and historical observations are not verified savings.";
    case "no_savings_evidence":
      return "Capture valid non-negative baseline and candidate token totals with a positive measured delta.";
    default:
      return candidate.measurementScope === "full_session" ? "Collect full-session verification evidence." : "Measure the full session.";
  }
}

/**
 * Evaluate an output-reduction technique without confusing a smaller payload
 * with a cheaper successful session. Retry and reducer overhead are charged to
 * the candidate, and loss of a required signal fails the evidence gate.
 */
export function evaluateOutputReduction(
  candidate: OutputReductionCandidate,
  options: { minimumSampleSize?: number } = {},
): OutputReductionEvaluation {
  const minimumSampleSize = Math.max(1, Math.trunc(options.minimumSampleSize ?? 5));
  const baselineTokens = normalizeNullableTokens(candidate.baselineTokens);
  const deliveredTokens = normalizeNullableTokens(candidate.deliveredTokens);
  const retryTokens = normalizeTokens(candidate.retryTokens);
  const reducerOverheadTokens = normalizeTokens(candidate.reducerOverheadTokens);
  const requiredSignals = uniqueSignals(candidate.requiredSignals);
  const preservedSignals = uniqueSignals(candidate.preservedSignals);
  const preservedSet = new Set(preservedSignals);
  const missingSignals = requiredSignals.filter((signal) => !preservedSet.has(signal));
  const netCandidateTokens = deliveredTokens === null
    ? null
    : deliveredTokens + retryTokens + reducerOverheadTokens;
  const measuredSavingsTokens = baselineTokens !== null && netCandidateTokens !== null
    ? baselineTokens - netCandidateTokens
    : null;
  const measuredSavingsPct = measuredSavingsTokens !== null && baselineTokens !== null && baselineTokens > 0
    ? round((measuredSavingsTokens / baselineTokens) * 100)
    : null;
  const sampleSize = Math.max(0, Math.trunc(candidate.sampleSize));

  let status: OutputReductionStatus;
  if (missingSignals.length > 0) status = "signal_loss";
  else if (candidate.qualityGate === "failed") status = "quality_regression";
  else if (measuredSavingsTokens !== null && measuredSavingsTokens < 0) status = "token_regression";
  else if (baselineTokens === null || netCandidateTokens === null || baselineTokens === 0 || measuredSavingsTokens === 0) status = "no_savings_evidence";
  else if (candidate.measurementScope !== "full_session") status = "payload_reduction_only";
  else if (candidate.qualityGate !== "passed") status = "quality_unverified";
  else if (candidate.evidenceType !== "measured_before_after") status = "candidate";
  else if (sampleSize < minimumSampleSize) status = "insufficient_samples";
  else status = "verified_savings";

  const evaluation: OutputReductionEvaluation = {
    id: candidate.id,
    label: candidate.label?.trim() || candidate.id,
    reducerVersion: candidate.reducerVersion?.trim() || null,
    status,
    claimable: status === "verified_savings",
    measurementScope: candidate.measurementScope,
    evidenceType: candidate.evidenceType,
    qualityGate: candidate.qualityGate,
    sampleSize,
    baselineTokens,
    deliveredTokens,
    retryTokens,
    reducerOverheadTokens,
    netCandidateTokens,
    measuredSavingsTokens,
    measuredSavingsPct,
    requiredSignals,
    preservedSignals,
    missingSignals,
    fallbackReason: candidate.fallbackReason?.trim() || null,
    evidenceSource: candidate.evidenceSource?.trim() || null,
    verificationRequired: null,
  };

  evaluation.verificationRequired = verificationRequired(candidate, evaluation, minimumSampleSize);
  return evaluation;
}
