export type RepositoryContextEvidenceType = "measured_before_after" | "historical_observation" | "modeled_estimate" | "unknown";
export type RepositoryContextQualityGate = "passed" | "failed" | "not_run";
export type RepositoryContextIndexState = "fresh" | "stale" | "unknown" | "not_applicable";

export type RepositoryContextStatus =
  | "verified_savings"
  | "candidate"
  | "insufficient_samples"
  | "quality_unverified"
  | "quality_regression"
  | "stale_index"
  | "retrieval_failure"
  | "token_regression"
  | "no_savings_evidence";

export interface RepositoryContextCandidate {
  id: string;
  label?: string;
  strategyVersion?: string | null;
  evidenceType: RepositoryContextEvidenceType;
  qualityGate: RepositoryContextQualityGate;
  indexState: RepositoryContextIndexState;
  sampleSize: number;
  baselineSessionTokens: number | null;
  candidateSessionTokens: number | null;
  fallbackReadTokens?: number | null;
  indexingSetupMs?: number | null;
  retrievalLatencyMs?: number | null;
  requiredEvidenceRefs?: string[];
  returnedEvidenceRefs?: string[];
  evidenceSource?: string | null;
}

export interface RepositoryContextEvaluation {
  id: string;
  label: string;
  strategyVersion: string | null;
  status: RepositoryContextStatus;
  claimable: boolean;
  evidenceType: RepositoryContextEvidenceType;
  qualityGate: RepositoryContextQualityGate;
  indexState: RepositoryContextIndexState;
  sampleSize: number;
  baselineSessionTokens: number | null;
  candidateSessionTokens: number | null;
  fallbackReadTokens: number;
  netCandidateTokens: number | null;
  measuredSavingsTokens: number | null;
  measuredSavingsPct: number | null;
  indexingSetupMs: number | null;
  retrievalLatencyMs: number | null;
  requiredEvidenceRefs: string[];
  returnedEvidenceRefs: string[];
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

function normalizedRefs(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function requirementFor(status: RepositoryContextStatus, missingRefs: string[], minimumSampleSize: number): string | null {
  switch (status) {
    case "verified_savings":
      return null;
    case "stale_index":
      return "Refresh or invalidate the repository index and repeat the same versioned workload.";
    case "retrieval_failure":
      return `Restore required repository evidence before adoption: ${missingRefs.join(", ")}.`;
    case "quality_regression":
      return "Fix the task-quality regression and repeat the same workload with equivalent acceptance criteria.";
    case "quality_unverified":
      return "Run an outcome-equivalent quality gate on the same workload.";
    case "token_regression":
      return "Investigate fallback reads and retrieval behavior; the candidate used more session tokens than baseline.";
    case "insufficient_samples":
      return `Collect at least ${minimumSampleSize} comparable full-session samples.`;
    case "candidate":
      return "Capture measured before/after full-session usage receipts; modeled and historical evidence cannot prove savings.";
    case "no_savings_evidence":
      return "Capture valid baseline and candidate full-session token totals with a positive measured delta.";
  }
}

/**
 * Evidence gate for semantic search, symbol/LSP retrieval, repository indexes,
 * code graphs and persistent code-context systems. Full-session token totals
 * include fallback file reads; stale indexes and required-evidence misses fail
 * closed even when the retrieved context is small.
 */
export function evaluateRepositoryContext(
  candidate: RepositoryContextCandidate,
  options: { minimumSampleSize?: number } = {},
): RepositoryContextEvaluation {
  const minimumSampleSize = Math.max(1, Math.trunc(options.minimumSampleSize ?? 5));
  const baselineSessionTokens = nullableNonNegative(candidate.baselineSessionTokens);
  const candidateSessionTokens = nullableNonNegative(candidate.candidateSessionTokens);
  const fallbackReadTokens = nonNegative(candidate.fallbackReadTokens);
  const netCandidateTokens = candidateSessionTokens === null ? null : candidateSessionTokens + fallbackReadTokens;
  const measuredSavingsTokens = baselineSessionTokens !== null && netCandidateTokens !== null
    ? baselineSessionTokens - netCandidateTokens
    : null;
  const measuredSavingsPct = measuredSavingsTokens !== null && baselineSessionTokens !== null && baselineSessionTokens > 0
    ? round((measuredSavingsTokens / baselineSessionTokens) * 100)
    : null;
  const requiredEvidenceRefs = normalizedRefs(candidate.requiredEvidenceRefs);
  const returnedEvidenceRefs = normalizedRefs(candidate.returnedEvidenceRefs);
  const returnedSet = new Set(returnedEvidenceRefs);
  const missingEvidenceRefs = requiredEvidenceRefs.filter((ref) => !returnedSet.has(ref));
  const sampleSize = Math.max(0, Math.trunc(candidate.sampleSize));

  let status: RepositoryContextStatus;
  if (candidate.indexState === "stale") status = "stale_index";
  else if (missingEvidenceRefs.length > 0) status = "retrieval_failure";
  else if (candidate.qualityGate === "failed") status = "quality_regression";
  else if (measuredSavingsTokens !== null && measuredSavingsTokens < 0) status = "token_regression";
  else if (baselineSessionTokens === null || netCandidateTokens === null || baselineSessionTokens === 0 || measuredSavingsTokens === 0) status = "no_savings_evidence";
  else if (candidate.qualityGate !== "passed") status = "quality_unverified";
  else if (candidate.evidenceType !== "measured_before_after") status = "candidate";
  else if (sampleSize < minimumSampleSize) status = "insufficient_samples";
  else status = "verified_savings";

  return {
    id: candidate.id,
    label: candidate.label?.trim() || candidate.id,
    strategyVersion: candidate.strategyVersion?.trim() || null,
    status,
    claimable: status === "verified_savings",
    evidenceType: candidate.evidenceType,
    qualityGate: candidate.qualityGate,
    indexState: candidate.indexState,
    sampleSize,
    baselineSessionTokens,
    candidateSessionTokens,
    fallbackReadTokens,
    netCandidateTokens,
    measuredSavingsTokens,
    measuredSavingsPct,
    indexingSetupMs: nullableNonNegative(candidate.indexingSetupMs),
    retrievalLatencyMs: nullableNonNegative(candidate.retrievalLatencyMs),
    requiredEvidenceRefs,
    returnedEvidenceRefs,
    missingEvidenceRefs,
    evidenceSource: candidate.evidenceSource?.trim() || null,
    verificationRequired: requirementFor(status, missingEvidenceRefs, minimumSampleSize),
  };
}
