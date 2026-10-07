export type PersistentMemoryEvidenceType = "measured_before_after" | "historical_observation" | "modeled_estimate" | "unknown";
export type PersistentMemoryQualityGate = "passed" | "failed" | "not_run";
export type PersistentMemoryFreshness = "fresh" | "stale" | "unknown";
export type PersistentMemoryProvenanceGate = "verified" | "failed" | "not_run";
export type PersistentMemoryIsolationGate = "verified" | "failed" | "not_run";

export type PersistentMemoryStatus =
  | "verified_savings"
  | "candidate"
  | "insufficient_samples"
  | "quality_unverified"
  | "quality_regression"
  | "stale_memory"
  | "provenance_failure"
  | "provenance_unverified"
  | "isolation_failure"
  | "isolation_unverified"
  | "evidence_loss"
  | "contradiction_regression"
  | "token_regression"
  | "no_savings_evidence";

export interface PersistentMemoryCandidate {
  id: string;
  memoryVersion?: string | null;
  evidenceType: PersistentMemoryEvidenceType;
  qualityGate: PersistentMemoryQualityGate;
  freshness: PersistentMemoryFreshness;
  provenanceGate: PersistentMemoryProvenanceGate;
  isolationGate: PersistentMemoryIsolationGate;
  sampleSize: number;
  baselineSessionTokens: number | null;
  candidateSessionTokens: number | null;
  memoryWriteTokens?: number | null;
  memoryIndexTokens?: number | null;
  memoryRetrievalTokens?: number | null;
  recoveryTokens?: number | null;
  requiredEvidenceRefs?: string[];
  retrievedEvidenceRefs?: string[];
  contradictoryMemoryCount?: number;
  staleMemoryCount?: number;
  evidenceSource?: string | null;
}

export interface PersistentMemoryEvaluation {
  id: string;
  memoryVersion: string | null;
  status: PersistentMemoryStatus;
  claimable: boolean;
  evidenceType: PersistentMemoryEvidenceType;
  qualityGate: PersistentMemoryQualityGate;
  freshness: PersistentMemoryFreshness;
  provenanceGate: PersistentMemoryProvenanceGate;
  isolationGate: PersistentMemoryIsolationGate;
  sampleSize: number;
  baselineSessionTokens: number | null;
  candidateSessionTokens: number | null;
  memoryWriteTokens: number;
  memoryIndexTokens: number;
  memoryRetrievalTokens: number;
  recoveryTokens: number;
  netCandidateTokens: number | null;
  measuredSavingsTokens: number | null;
  measuredSavingsPct: number | null;
  requiredEvidenceRefs: string[];
  retrievedEvidenceRefs: string[];
  missingEvidenceRefs: string[];
  contradictoryMemoryCount: number;
  staleMemoryCount: number;
  evidenceSource: string | null;
  verificationRequired: string | null;
}

function nullableNonNegative(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function nonNegative(value: number | null | undefined): number {
  return nullableNonNegative(value) ?? 0;
}

function count(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

function normalizeStrings(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function requirementFor(status: PersistentMemoryStatus, missingEvidenceRefs: string[], minimumSampleSize: number): string | null {
  switch (status) {
    case "verified_savings":
      return null;
    case "stale_memory":
      return "Refresh or invalidate stale memories and repeat the same workload.";
    case "provenance_failure":
      return "Repair memory provenance so retrieved claims resolve to authoritative source evidence.";
    case "provenance_unverified":
      return "Verify source provenance for memory writes and retrieval receipts.";
    case "isolation_failure":
      return "Fix tenant/project/authorization isolation before memory reuse.";
    case "isolation_unverified":
      return "Verify tenant/project/authorization isolation for writes, retrieval and deletion.";
    case "evidence_loss":
      return `Retrieve all task-required durable evidence before adoption: ${missingEvidenceRefs.join(", ")}.`;
    case "contradiction_regression":
      return "Resolve contradictory or superseded memories before promoting the memory policy.";
    case "quality_regression":
      return "Fix the outcome-quality regression and repeat the same versioned workload.";
    case "quality_unverified":
      return "Run an outcome-equivalent quality gate with and without persistent memory.";
    case "token_regression":
      return "Investigate write, indexing, retrieval and recovery overhead; candidate net tokens exceed baseline.";
    case "insufficient_samples":
      return `Collect at least ${minimumSampleSize} comparable measured multi-session samples.`;
    case "candidate":
      return "Capture measured before/after multi-session receipts; historical/modelled observations are not verified savings.";
    case "no_savings_evidence":
      return "Capture valid baseline/candidate session token totals with a positive measured delta.";
  }
}

/**
 * Evidence gate for persistent agent memory and repository knowledge systems.
 * Memory write/index/retrieval overhead is charged to the candidate and stale,
 * contradictory, unprovenanced or cross-tenant memory fails closed.
 */
export function evaluatePersistentMemory(
  candidate: PersistentMemoryCandidate,
  options: { minimumSampleSize?: number } = {},
): PersistentMemoryEvaluation {
  const minimumSampleSize = Math.max(1, Math.trunc(options.minimumSampleSize ?? 5));
  const baselineSessionTokens = nullableNonNegative(candidate.baselineSessionTokens);
  const candidateSessionTokens = nullableNonNegative(candidate.candidateSessionTokens);
  const memoryWriteTokens = nonNegative(candidate.memoryWriteTokens);
  const memoryIndexTokens = nonNegative(candidate.memoryIndexTokens);
  const memoryRetrievalTokens = nonNegative(candidate.memoryRetrievalTokens);
  const recoveryTokens = nonNegative(candidate.recoveryTokens);
  const netCandidateTokens = candidateSessionTokens === null
    ? null
    : candidateSessionTokens + memoryWriteTokens + memoryIndexTokens + memoryRetrievalTokens + recoveryTokens;
  const measuredSavingsTokens = baselineSessionTokens !== null && netCandidateTokens !== null
    ? baselineSessionTokens - netCandidateTokens
    : null;
  const measuredSavingsPct = measuredSavingsTokens !== null && baselineSessionTokens !== null && baselineSessionTokens > 0
    ? round((measuredSavingsTokens / baselineSessionTokens) * 100)
    : null;

  const requiredEvidenceRefs = normalizeStrings(candidate.requiredEvidenceRefs);
  const retrievedEvidenceRefs = normalizeStrings(candidate.retrievedEvidenceRefs);
  const retrievedSet = new Set(retrievedEvidenceRefs);
  const missingEvidenceRefs = requiredEvidenceRefs.filter((ref) => !retrievedSet.has(ref));
  const contradictoryMemoryCount = count(candidate.contradictoryMemoryCount);
  const staleMemoryCount = count(candidate.staleMemoryCount);
  const sampleSize = Math.max(0, Math.trunc(candidate.sampleSize));

  let status: PersistentMemoryStatus;
  if (candidate.isolationGate === "failed") status = "isolation_failure";
  else if (candidate.isolationGate !== "verified") status = "isolation_unverified";
  else if (candidate.provenanceGate === "failed") status = "provenance_failure";
  else if (candidate.provenanceGate !== "verified") status = "provenance_unverified";
  else if (candidate.freshness === "stale" || staleMemoryCount > 0) status = "stale_memory";
  else if (missingEvidenceRefs.length > 0) status = "evidence_loss";
  else if (contradictoryMemoryCount > 0) status = "contradiction_regression";
  else if (candidate.qualityGate === "failed") status = "quality_regression";
  else if (measuredSavingsTokens !== null && measuredSavingsTokens < 0) status = "token_regression";
  else if (baselineSessionTokens === null || netCandidateTokens === null || baselineSessionTokens === 0 || measuredSavingsTokens === 0) status = "no_savings_evidence";
  else if (candidate.qualityGate !== "passed") status = "quality_unverified";
  else if (candidate.evidenceType !== "measured_before_after") status = "candidate";
  else if (sampleSize < minimumSampleSize) status = "insufficient_samples";
  else status = "verified_savings";

  return {
    id: candidate.id,
    memoryVersion: candidate.memoryVersion?.trim() || null,
    status,
    claimable: status === "verified_savings",
    evidenceType: candidate.evidenceType,
    qualityGate: candidate.qualityGate,
    freshness: candidate.freshness,
    provenanceGate: candidate.provenanceGate,
    isolationGate: candidate.isolationGate,
    sampleSize,
    baselineSessionTokens,
    candidateSessionTokens,
    memoryWriteTokens,
    memoryIndexTokens,
    memoryRetrievalTokens,
    recoveryTokens,
    netCandidateTokens,
    measuredSavingsTokens,
    measuredSavingsPct,
    requiredEvidenceRefs,
    retrievedEvidenceRefs,
    missingEvidenceRefs,
    contradictoryMemoryCount,
    staleMemoryCount,
    evidenceSource: candidate.evidenceSource?.trim() || null,
    verificationRequired: requirementFor(status, missingEvidenceRefs, minimumSampleSize),
  };
}
