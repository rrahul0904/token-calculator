export type ContextCompressionMeasurementScope = "payload_only" | "full_session";
export type ContextCompressionEvidenceType = "measured_before_after" | "historical_observation" | "modeled_estimate" | "unknown";
export type ContextCompressionQualityGate = "passed" | "failed" | "not_run";
export type ContextCompressionCachePrefixGate = "preserved" | "changed" | "not_applicable" | "not_run";

export type ContextCompressionStatus =
  | "verified_savings"
  | "payload_reduction_only"
  | "candidate"
  | "insufficient_samples"
  | "quality_unverified"
  | "quality_regression"
  | "evidence_loss"
  | "cache_prefix_regression"
  | "token_regression"
  | "no_savings_evidence";

export interface ContextCompressionCandidate {
  id: string;
  compressorVersion?: string | null;
  measurementScope: ContextCompressionMeasurementScope;
  evidenceType: ContextCompressionEvidenceType;
  qualityGate: ContextCompressionQualityGate;
  cachePrefixGate: ContextCompressionCachePrefixGate;
  sampleSize: number;
  baselineContextTokens: number | null;
  deliveredContextTokens: number | null;
  baselineSessionTokens?: number | null;
  candidateSessionTokens?: number | null;
  auxiliaryModelInputTokens?: number | null;
  auxiliaryModelOutputTokens?: number | null;
  recoveryTokens?: number | null;
  retryTokens?: number | null;
  compressionLatencyMs?: number | null;
  requiredEvidenceRefs?: string[];
  preservedEvidenceRefs?: string[];
  evidenceSource?: string | null;
}

export interface ContextCompressionEvaluation {
  id: string;
  compressorVersion: string | null;
  status: ContextCompressionStatus;
  claimable: boolean;
  measurementScope: ContextCompressionMeasurementScope;
  evidenceType: ContextCompressionEvidenceType;
  qualityGate: ContextCompressionQualityGate;
  cachePrefixGate: ContextCompressionCachePrefixGate;
  sampleSize: number;
  baselineContextTokens: number | null;
  deliveredContextTokens: number | null;
  contextSavingsTokens: number | null;
  contextSavingsPct: number | null;
  baselineSessionTokens: number | null;
  candidateSessionTokens: number | null;
  auxiliaryModelInputTokens: number;
  auxiliaryModelOutputTokens: number;
  recoveryTokens: number;
  retryTokens: number;
  netCandidateTokens: number | null;
  measuredSavingsTokens: number | null;
  measuredSavingsPct: number | null;
  compressionLatencyMs: number | null;
  requiredEvidenceRefs: string[];
  preservedEvidenceRefs: string[];
  missingEvidenceRefs: string[];
  evidenceSource: string | null;
  verificationRequired: string | null;
}

function nullableNonNegative(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function nonNegative(value: number | null | undefined): number {
  return nullableNonNegative(value) ?? 0;
}

function normalizeStrings(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function requirementFor(
  status: ContextCompressionStatus,
  missingEvidenceRefs: string[],
  minimumSampleSize: number,
): string | null {
  switch (status) {
    case "verified_savings":
      return null;
    case "payload_reduction_only":
      return "Measure the same workload end to end; compressed context size alone is not verified session savings.";
    case "evidence_loss":
      return `Preserve all task-required evidence before adoption: ${missingEvidenceRefs.join(", ")}.`;
    case "cache_prefix_regression":
      return "Preserve the configured prompt-cache boundary or benchmark the cache-prefix change as a separate candidate.";
    case "quality_regression":
      return "Fix the task-quality regression and repeat the same versioned workload.";
    case "quality_unverified":
      return "Run an outcome-equivalent quality gate on baseline and compressed sessions.";
    case "token_regression":
      return "Investigate auxiliary compression-model, recovery and retry overhead; candidate net tokens exceed baseline.";
    case "insufficient_samples":
      return `Collect at least ${minimumSampleSize} comparable measured full-session samples.`;
    case "candidate":
      return "Capture measured before/after full-session receipts; modeled and historical observations cannot verify savings.";
    case "no_savings_evidence":
      return "Capture valid baseline/candidate full-session token totals with a positive measured delta.";
  }
}

/**
 * Evidence gate for prompt/context compressors such as model-assisted or
 * deterministic context reducers. Auxiliary compressor-model usage, recovery
 * and retries are charged to the candidate. Required evidence and cache-prefix
 * behavior are explicit correctness/economics boundaries.
 */
export function evaluateContextCompression(
  candidate: ContextCompressionCandidate,
  options: { minimumSampleSize?: number } = {},
): ContextCompressionEvaluation {
  const minimumSampleSize = Math.max(1, Math.trunc(options.minimumSampleSize ?? 5));
  const baselineContextTokens = nullableNonNegative(candidate.baselineContextTokens);
  const deliveredContextTokens = nullableNonNegative(candidate.deliveredContextTokens);
  const contextSavingsTokens = baselineContextTokens !== null && deliveredContextTokens !== null
    ? baselineContextTokens - deliveredContextTokens
    : null;
  const contextSavingsPct = contextSavingsTokens !== null && baselineContextTokens !== null && baselineContextTokens > 0
    ? round((contextSavingsTokens / baselineContextTokens) * 100)
    : null;

  const baselineSessionTokens = nullableNonNegative(candidate.baselineSessionTokens);
  const candidateSessionTokens = nullableNonNegative(candidate.candidateSessionTokens);
  const auxiliaryModelInputTokens = nonNegative(candidate.auxiliaryModelInputTokens);
  const auxiliaryModelOutputTokens = nonNegative(candidate.auxiliaryModelOutputTokens);
  const recoveryTokens = nonNegative(candidate.recoveryTokens);
  const retryTokens = nonNegative(candidate.retryTokens);
  const netCandidateTokens = candidateSessionTokens === null
    ? null
    : candidateSessionTokens + auxiliaryModelInputTokens + auxiliaryModelOutputTokens + recoveryTokens + retryTokens;
  const measuredSavingsTokens = baselineSessionTokens !== null && netCandidateTokens !== null
    ? baselineSessionTokens - netCandidateTokens
    : null;
  const measuredSavingsPct = measuredSavingsTokens !== null && baselineSessionTokens !== null && baselineSessionTokens > 0
    ? round((measuredSavingsTokens / baselineSessionTokens) * 100)
    : null;

  const requiredEvidenceRefs = normalizeStrings(candidate.requiredEvidenceRefs);
  const preservedEvidenceRefs = normalizeStrings(candidate.preservedEvidenceRefs);
  const preserved = new Set(preservedEvidenceRefs);
  const missingEvidenceRefs = requiredEvidenceRefs.filter((ref) => !preserved.has(ref));
  const sampleSize = Math.max(0, Math.trunc(candidate.sampleSize));

  let status: ContextCompressionStatus;
  if (missingEvidenceRefs.length > 0) status = "evidence_loss";
  else if (candidate.cachePrefixGate === "changed") status = "cache_prefix_regression";
  else if (candidate.qualityGate === "failed") status = "quality_regression";
  else if (measuredSavingsTokens !== null && measuredSavingsTokens < 0) status = "token_regression";
  else if (candidate.measurementScope !== "full_session") status = "payload_reduction_only";
  else if (baselineSessionTokens === null || netCandidateTokens === null || baselineSessionTokens === 0 || measuredSavingsTokens === 0) status = "no_savings_evidence";
  else if (candidate.qualityGate !== "passed") status = "quality_unverified";
  else if (candidate.evidenceType !== "measured_before_after") status = "candidate";
  else if (sampleSize < minimumSampleSize) status = "insufficient_samples";
  else status = "verified_savings";

  return {
    id: candidate.id,
    compressorVersion: candidate.compressorVersion?.trim() || null,
    status,
    claimable: status === "verified_savings",
    measurementScope: candidate.measurementScope,
    evidenceType: candidate.evidenceType,
    qualityGate: candidate.qualityGate,
    cachePrefixGate: candidate.cachePrefixGate,
    sampleSize,
    baselineContextTokens,
    deliveredContextTokens,
    contextSavingsTokens,
    contextSavingsPct,
    baselineSessionTokens,
    candidateSessionTokens,
    auxiliaryModelInputTokens,
    auxiliaryModelOutputTokens,
    recoveryTokens,
    retryTokens,
    netCandidateTokens,
    measuredSavingsTokens,
    measuredSavingsPct,
    compressionLatencyMs: nullableNonNegative(candidate.compressionLatencyMs),
    requiredEvidenceRefs,
    preservedEvidenceRefs,
    missingEvidenceRefs,
    evidenceSource: candidate.evidenceSource?.trim() || null,
    verificationRequired: requirementFor(status, missingEvidenceRefs, minimumSampleSize),
  };
}
