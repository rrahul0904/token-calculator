export type ResponseDensityLevel = "readable" | "dense" | "extreme";
export type ResponseDensityEvidenceType =
  | "measured_before_after"
  | "historical_observation"
  | "modeled_estimate"
  | "unknown";
export type ResponseDensityQualityGate = "passed" | "failed" | "not_run";

export type ResponseDensityStatus =
  | "verified_savings"
  | "candidate"
  | "output_reduction_only"
  | "insufficient_samples"
  | "quality_unverified"
  | "quality_regression"
  | "preservation_failure"
  | "persistence_failure"
  | "ambiguity_regression"
  | "token_regression"
  | "no_savings_evidence";

export interface ResponseDensityCandidate {
  id: string;
  label?: string;
  policyVersion?: string | null;
  level: ResponseDensityLevel;
  evidenceType: ResponseDensityEvidenceType;
  qualityGate: ResponseDensityQualityGate;
  sampleSize: number;
  baselineOutputTokens: number | null;
  candidateOutputTokens: number | null;
  baselineSessionTokens: number | null;
  candidateSessionTokens: number | null;
  instructionOverheadTokens?: number | null;
  retryTokens?: number | null;
  requiredPreservationClasses?: string[];
  preservedClasses?: string[];
  persistenceVerified?: boolean;
  baselineClarificationTurns?: number | null;
  candidateClarificationTurns?: number | null;
  evidenceSource?: string | null;
}

export interface ResponseDensityEvaluation {
  id: string;
  label: string;
  policyVersion: string | null;
  level: ResponseDensityLevel;
  status: ResponseDensityStatus;
  claimable: boolean;
  evidenceType: ResponseDensityEvidenceType;
  qualityGate: ResponseDensityQualityGate;
  sampleSize: number;
  baselineOutputTokens: number | null;
  candidateOutputTokens: number | null;
  measuredOutputReductionTokens: number | null;
  measuredOutputReductionPct: number | null;
  baselineSessionTokens: number | null;
  candidateSessionTokens: number | null;
  instructionOverheadTokens: number;
  retryTokens: number;
  netCandidateSessionTokens: number | null;
  measuredSessionSavingsTokens: number | null;
  measuredSessionSavingsPct: number | null;
  requiredPreservationClasses: string[];
  preservedClasses: string[];
  missingPreservationClasses: string[];
  persistenceVerified: boolean;
  baselineClarificationTurns: number | null;
  candidateClarificationTurns: number | null;
  clarificationDelta: number | null;
  evidenceSource: string | null;
  verificationRequired: string | null;
}

function nullableNonNegative(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function nonNegative(value: number | null | undefined): number {
  return nullableNonNegative(value) ?? 0;
}

function normalizeSet(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function percent(delta: number | null, baseline: number | null): number | null {
  return delta !== null && baseline !== null && baseline > 0
    ? round((delta / baseline) * 100)
    : null;
}

function verificationRequired(
  status: ResponseDensityStatus,
  missingPreservationClasses: string[],
  minimumSampleSize: number,
): string | null {
  switch (status) {
    case "verified_savings":
      return null;
    case "preservation_failure":
      return `Preserve all required response classes before adoption: ${missingPreservationClasses.join(", ")}.`;
    case "persistence_failure":
      return "Verify the response-density policy remains active across the complete evaluated session without silent drift.";
    case "ambiguity_regression":
      return "Reduce ambiguity and repeat the same workload; the candidate caused more clarification turns than baseline.";
    case "quality_regression":
      return "Fix the task-quality regression and repeat the same versioned workload.";
    case "quality_unverified":
      return "Run an outcome-equivalent quality gate on the same versioned workload.";
    case "token_regression":
      return "Investigate retries and instruction overhead; the candidate used more net session tokens than baseline.";
    case "output_reduction_only":
      return "Measure the same workload end to end. Shorter replies alone do not prove full-session token savings.";
    case "insufficient_samples":
      return `Collect at least ${minimumSampleSize} comparable measured full-session samples.`;
    case "candidate":
      return "Capture paired measured full-session usage receipts; modeled and historical observations cannot prove savings.";
    case "no_savings_evidence":
      return "Capture valid non-negative baseline and candidate token totals with a positive full-session delta.";
  }
}

/**
 * Evidence gate for prompt/rules-based response-density policies.
 *
 * This intentionally evaluates the policy as a full-session intervention rather
 * than accepting shorter visible replies as proof of lower token usage. Repeated
 * policy instructions, retries and clarification turns can erase apparent output
 * savings, so they remain part of the candidate economics and quality gate.
 */
export function evaluateResponseDensityPolicy(
  candidate: ResponseDensityCandidate,
  options: { minimumSampleSize?: number } = {},
): ResponseDensityEvaluation {
  const minimumSampleSize = Math.max(1, Math.trunc(options.minimumSampleSize ?? 5));
  const baselineOutputTokens = nullableNonNegative(candidate.baselineOutputTokens);
  const candidateOutputTokens = nullableNonNegative(candidate.candidateOutputTokens);
  const baselineSessionTokens = nullableNonNegative(candidate.baselineSessionTokens);
  const candidateSessionTokens = nullableNonNegative(candidate.candidateSessionTokens);
  const instructionOverheadTokens = nonNegative(candidate.instructionOverheadTokens);
  const retryTokens = nonNegative(candidate.retryTokens);
  const sampleSize = Math.max(0, Math.trunc(candidate.sampleSize));

  const measuredOutputReductionTokens = baselineOutputTokens !== null && candidateOutputTokens !== null
    ? baselineOutputTokens - candidateOutputTokens
    : null;
  const measuredOutputReductionPct = percent(measuredOutputReductionTokens, baselineOutputTokens);

  const netCandidateSessionTokens = candidateSessionTokens === null
    ? null
    : candidateSessionTokens + instructionOverheadTokens + retryTokens;
  const measuredSessionSavingsTokens = baselineSessionTokens !== null && netCandidateSessionTokens !== null
    ? baselineSessionTokens - netCandidateSessionTokens
    : null;
  const measuredSessionSavingsPct = percent(measuredSessionSavingsTokens, baselineSessionTokens);

  const requiredPreservationClasses = normalizeSet(candidate.requiredPreservationClasses);
  const preservedClasses = normalizeSet(candidate.preservedClasses);
  const preservedSet = new Set(preservedClasses);
  const missingPreservationClasses = requiredPreservationClasses.filter((value) => !preservedSet.has(value));
  const persistenceVerified = candidate.persistenceVerified === true;

  const baselineClarificationTurns = nullableNonNegative(candidate.baselineClarificationTurns);
  const candidateClarificationTurns = nullableNonNegative(candidate.candidateClarificationTurns);
  const clarificationDelta = baselineClarificationTurns !== null && candidateClarificationTurns !== null
    ? candidateClarificationTurns - baselineClarificationTurns
    : null;

  let status: ResponseDensityStatus;
  if (missingPreservationClasses.length > 0) status = "preservation_failure";
  else if (!persistenceVerified) status = "persistence_failure";
  else if (candidate.qualityGate === "failed") status = "quality_regression";
  else if (clarificationDelta !== null && clarificationDelta > 0) status = "ambiguity_regression";
  else if (measuredSessionSavingsTokens !== null && measuredSessionSavingsTokens < 0) status = "token_regression";
  else if (baselineSessionTokens === null || netCandidateSessionTokens === null) status = "output_reduction_only";
  else if (baselineSessionTokens === 0 || measuredSessionSavingsTokens === 0) status = "no_savings_evidence";
  else if (candidate.qualityGate !== "passed") status = "quality_unverified";
  else if (candidate.evidenceType !== "measured_before_after") status = "candidate";
  else if (sampleSize < minimumSampleSize) status = "insufficient_samples";
  else status = "verified_savings";

  return {
    id: candidate.id,
    label: candidate.label?.trim() || candidate.id,
    policyVersion: candidate.policyVersion?.trim() || null,
    level: candidate.level,
    status,
    claimable: status === "verified_savings",
    evidenceType: candidate.evidenceType,
    qualityGate: candidate.qualityGate,
    sampleSize,
    baselineOutputTokens,
    candidateOutputTokens,
    measuredOutputReductionTokens,
    measuredOutputReductionPct,
    baselineSessionTokens,
    candidateSessionTokens,
    instructionOverheadTokens,
    retryTokens,
    netCandidateSessionTokens,
    measuredSessionSavingsTokens,
    measuredSessionSavingsPct,
    requiredPreservationClasses,
    preservedClasses,
    missingPreservationClasses,
    persistenceVerified,
    baselineClarificationTurns,
    candidateClarificationTurns,
    clarificationDelta,
    evidenceSource: candidate.evidenceSource?.trim() || null,
    verificationRequired: verificationRequired(status, missingPreservationClasses, minimumSampleSize),
  };
}
