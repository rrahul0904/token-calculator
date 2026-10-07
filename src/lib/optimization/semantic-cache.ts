export type SemanticCacheMode = "exact" | "semantic";
export type SemanticCacheEvidenceType = "measured_before_after" | "historical_observation" | "modeled_estimate" | "unknown";
export type SemanticCacheQualityGate = "passed" | "failed" | "not_run";
export type SemanticCacheFreshness = "fresh" | "stale" | "unknown";
export type SemanticCacheIsolationGate = "verified" | "failed" | "not_run";

export type SemanticCacheStatus =
  | "verified_savings"
  | "candidate"
  | "insufficient_samples"
  | "quality_unverified"
  | "quality_regression"
  | "stale_cache"
  | "tenant_isolation_failure"
  | "tenant_isolation_unverified"
  | "false_hit_regression"
  | "token_regression"
  | "no_savings_evidence";

export interface SemanticCacheCandidate {
  id: string;
  cacheMode: SemanticCacheMode;
  cacheVersion?: string | null;
  evidenceType: SemanticCacheEvidenceType;
  qualityGate: SemanticCacheQualityGate;
  freshness: SemanticCacheFreshness;
  isolationGate: SemanticCacheIsolationGate;
  sampleSize: number;
  baselineSessionTokens: number | null;
  candidateSessionTokens: number | null;
  lookupOverheadTokens?: number | null;
  validationTokens?: number | null;
  falseHitRecoveryTokens?: number | null;
  providerFallbackTokens?: number | null;
  observedHits: number;
  observedMisses: number;
  observedFalseHits: number;
  maxFalseHitRate?: number;
  evidenceSource?: string | null;
}

export interface SemanticCacheEvaluation {
  id: string;
  cacheMode: SemanticCacheMode;
  cacheVersion: string | null;
  status: SemanticCacheStatus;
  claimable: boolean;
  evidenceType: SemanticCacheEvidenceType;
  qualityGate: SemanticCacheQualityGate;
  freshness: SemanticCacheFreshness;
  isolationGate: SemanticCacheIsolationGate;
  sampleSize: number;
  baselineSessionTokens: number | null;
  candidateSessionTokens: number | null;
  lookupOverheadTokens: number;
  validationTokens: number;
  falseHitRecoveryTokens: number;
  providerFallbackTokens: number;
  netCandidateTokens: number | null;
  measuredSavingsTokens: number | null;
  measuredSavingsPct: number | null;
  observedHits: number;
  observedMisses: number;
  observedFalseHits: number;
  hitRate: number | null;
  falseHitRate: number | null;
  maxFalseHitRate: number;
  evidenceSource: string | null;
  verificationRequired: string | null;
}

function nullableNonNegative(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function nonNegative(value: number | null | undefined): number {
  return nullableNonNegative(value) ?? 0;
}

function count(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function requirementFor(status: SemanticCacheStatus, minimumSampleSize: number): string | null {
  switch (status) {
    case "verified_savings":
      return null;
    case "stale_cache":
      return "Invalidate or refresh stale cache entries and repeat the same versioned workload.";
    case "tenant_isolation_failure":
      return "Fix tenant/cache-key isolation before using cached responses.";
    case "tenant_isolation_unverified":
      return "Verify tenant and authorization isolation for cache keys, values and invalidation paths.";
    case "false_hit_regression":
      return "Tighten semantic matching or validation; observed false-hit rate exceeds the accepted threshold.";
    case "quality_regression":
      return "Fix the outcome-quality regression and repeat the same workload.";
    case "quality_unverified":
      return "Run an outcome-equivalent quality gate for cache hits and misses.";
    case "token_regression":
      return "Investigate lookup, validation, false-hit recovery and provider-fallback overhead.";
    case "insufficient_samples":
      return `Collect at least ${minimumSampleSize} comparable measured samples.`;
    case "candidate":
      return "Capture measured before/after full-session receipts; modeled and historical observations are not verified savings.";
    case "no_savings_evidence":
      return "Capture valid baseline/candidate session totals with a positive measured delta.";
  }
}

/**
 * Evidence gate for exact and semantic response caches. A cache hit is not
 * automatically a saving: lookup/validation/fallback costs and false-hit
 * recovery are charged to the candidate, while freshness and tenant isolation
 * are mandatory correctness boundaries.
 */
export function evaluateSemanticCache(
  candidate: SemanticCacheCandidate,
  options: { minimumSampleSize?: number; defaultMaxFalseHitRate?: number } = {},
): SemanticCacheEvaluation {
  const minimumSampleSize = Math.max(1, Math.trunc(options.minimumSampleSize ?? 5));
  const maxFalseHitRate = Math.max(0, Math.min(1, candidate.maxFalseHitRate ?? options.defaultMaxFalseHitRate ?? 0));
  const baselineSessionTokens = nullableNonNegative(candidate.baselineSessionTokens);
  const candidateSessionTokens = nullableNonNegative(candidate.candidateSessionTokens);
  const lookupOverheadTokens = nonNegative(candidate.lookupOverheadTokens);
  const validationTokens = nonNegative(candidate.validationTokens);
  const falseHitRecoveryTokens = nonNegative(candidate.falseHitRecoveryTokens);
  const providerFallbackTokens = nonNegative(candidate.providerFallbackTokens);
  const netCandidateTokens = candidateSessionTokens === null
    ? null
    : candidateSessionTokens + lookupOverheadTokens + validationTokens + falseHitRecoveryTokens + providerFallbackTokens;
  const measuredSavingsTokens = baselineSessionTokens !== null && netCandidateTokens !== null
    ? baselineSessionTokens - netCandidateTokens
    : null;
  const measuredSavingsPct = measuredSavingsTokens !== null && baselineSessionTokens !== null && baselineSessionTokens > 0
    ? round((measuredSavingsTokens / baselineSessionTokens) * 100, 2)
    : null;

  const observedHits = count(candidate.observedHits);
  const observedMisses = count(candidate.observedMisses);
  const observedFalseHits = count(candidate.observedFalseHits);
  const totalLookups = observedHits + observedMisses;
  const hitRate = totalLookups > 0 ? round(observedHits / totalLookups) : null;
  const falseHitRate = observedHits > 0 ? round(observedFalseHits / observedHits) : 0;
  const sampleSize = Math.max(0, Math.trunc(candidate.sampleSize));

  let status: SemanticCacheStatus;
  if (candidate.isolationGate === "failed") status = "tenant_isolation_failure";
  else if (candidate.isolationGate !== "verified") status = "tenant_isolation_unverified";
  else if (candidate.freshness === "stale") status = "stale_cache";
  else if (falseHitRate !== null && falseHitRate > maxFalseHitRate) status = "false_hit_regression";
  else if (candidate.qualityGate === "failed") status = "quality_regression";
  else if (measuredSavingsTokens !== null && measuredSavingsTokens < 0) status = "token_regression";
  else if (baselineSessionTokens === null || netCandidateTokens === null || baselineSessionTokens === 0 || measuredSavingsTokens === 0) status = "no_savings_evidence";
  else if (candidate.qualityGate !== "passed") status = "quality_unverified";
  else if (candidate.evidenceType !== "measured_before_after") status = "candidate";
  else if (sampleSize < minimumSampleSize) status = "insufficient_samples";
  else status = "verified_savings";

  return {
    id: candidate.id,
    cacheMode: candidate.cacheMode,
    cacheVersion: candidate.cacheVersion?.trim() || null,
    status,
    claimable: status === "verified_savings",
    evidenceType: candidate.evidenceType,
    qualityGate: candidate.qualityGate,
    freshness: candidate.freshness,
    isolationGate: candidate.isolationGate,
    sampleSize,
    baselineSessionTokens,
    candidateSessionTokens,
    lookupOverheadTokens,
    validationTokens,
    falseHitRecoveryTokens,
    providerFallbackTokens,
    netCandidateTokens,
    measuredSavingsTokens,
    measuredSavingsPct,
    observedHits,
    observedMisses,
    observedFalseHits,
    hitRate,
    falseHitRate,
    maxFalseHitRate,
    evidenceSource: candidate.evidenceSource?.trim() || null,
    verificationRequired: requirementFor(status, minimumSampleSize),
  };
}
