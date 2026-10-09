export type PromptCacheEvidenceType = "measured_before_after" | "historical_observation" | "modeled_estimate" | "unknown";
export type PromptCacheQualityGate = "passed" | "failed" | "not_run";
export type PromptCacheAccountingGate = "verified" | "failed" | "not_run";

export type PromptCacheEconomicsStatus =
  | "verified_cost_savings"
  | "candidate"
  | "insufficient_samples"
  | "quality_unverified"
  | "quality_regression"
  | "cache_accounting_unverified"
  | "cache_accounting_failure"
  | "prefix_instability"
  | "cost_regression"
  | "no_cost_savings_evidence";

export interface PromptCacheEconomicsCandidate {
  id: string;
  policyVersion?: string | null;
  evidenceType: PromptCacheEvidenceType;
  qualityGate: PromptCacheQualityGate;
  cacheAccountingGate: PromptCacheAccountingGate;
  sampleSize: number;
  baselineCostUsd: number | null;
  candidateCostUsd: number | null;
  cacheControlOverheadCostUsd?: number | null;
  fallbackCostUsd?: number | null;
  baselineLogicalTokens?: number | null;
  candidateLogicalTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  fallbackTokens?: number | null;
  stablePrefixRate?: number | null;
  minimumStablePrefixRate?: number;
  evidenceSource?: string | null;
}

export interface PromptCacheEconomicsEvaluation {
  id: string;
  policyVersion: string | null;
  status: PromptCacheEconomicsStatus;
  costSavingsClaimable: boolean;
  tokenSavingsClaimable: false;
  claimClass: "cost_reduction_only";
  evidenceType: PromptCacheEvidenceType;
  qualityGate: PromptCacheQualityGate;
  cacheAccountingGate: PromptCacheAccountingGate;
  sampleSize: number;
  baselineCostUsd: number | null;
  candidateCostUsd: number | null;
  cacheControlOverheadCostUsd: number;
  fallbackCostUsd: number;
  netCandidateCostUsd: number | null;
  measuredCostSavingsUsd: number | null;
  measuredCostSavingsPct: number | null;
  baselineLogicalTokens: number | null;
  candidateLogicalTokens: number | null;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  fallbackTokens: number;
  observedLogicalTokenDelta: number | null;
  stablePrefixRate: number | null;
  minimumStablePrefixRate: number;
  evidenceSource: string | null;
  verificationRequired: string | null;
}

function nullableNonNegative(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function nonNegative(value: number | null | undefined): number {
  return nullableNonNegative(value) ?? 0;
}

function boundedRate(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function requirementFor(status: PromptCacheEconomicsStatus, minimumSampleSize: number): string | null {
  switch (status) {
    case "verified_cost_savings": return null;
    case "cache_accounting_failure": return "Fix provider cache-accounting inconsistencies before using cached-token economics as evidence.";
    case "cache_accounting_unverified": return "Verify cache reads/writes from authoritative provider or gateway receipts rather than client self-report.";
    case "prefix_instability": return "Stabilize the reusable prompt prefix and repeat the same workload before claiming cache economics.";
    case "quality_regression": return "Fix the outcome-quality regression and repeat the same cache policy cohort.";
    case "quality_unverified": return "Run the same outcome-equivalence quality gate for cached and baseline cohorts.";
    case "cost_regression": return "Inspect cache writes, misses, fallbacks and control-plane overhead; candidate cost exceeds baseline.";
    case "insufficient_samples": return `Collect at least ${minimumSampleSize} comparable measured cache samples.`;
    case "candidate": return "Capture measured same-cohort provider billing evidence; modeled or historical cache economics are not verified savings.";
    case "no_cost_savings_evidence": return "Capture valid baseline and candidate billed cost with a positive measured delta.";
  }
}

/**
 * Evidence gate for provider prompt-cache optimization. Cache reads may lower
 * billed cost without reducing the logical tokens the model consumes, so this
 * evaluator deliberately never turns cache economics into a raw token-savings
 * claim. Cache writes, fallbacks and control-plane overhead are charged to the
 * candidate.
 */
export function evaluatePromptCacheEconomics(
  candidate: PromptCacheEconomicsCandidate,
  options: { minimumSampleSize?: number } = {},
): PromptCacheEconomicsEvaluation {
  const minimumSampleSize = Math.max(1, Math.trunc(options.minimumSampleSize ?? 5));
  const baselineCostUsd = nullableNonNegative(candidate.baselineCostUsd);
  const candidateCostUsd = nullableNonNegative(candidate.candidateCostUsd);
  const cacheControlOverheadCostUsd = nonNegative(candidate.cacheControlOverheadCostUsd);
  const fallbackCostUsd = nonNegative(candidate.fallbackCostUsd);
  const netCandidateCostUsd = candidateCostUsd === null ? null : candidateCostUsd + cacheControlOverheadCostUsd + fallbackCostUsd;
  const measuredCostSavingsUsd = baselineCostUsd !== null && netCandidateCostUsd !== null ? baselineCostUsd - netCandidateCostUsd : null;
  const measuredCostSavingsPct = measuredCostSavingsUsd !== null && baselineCostUsd !== null && baselineCostUsd > 0
    ? round((measuredCostSavingsUsd / baselineCostUsd) * 100)
    : null;

  const baselineLogicalTokens = nullableNonNegative(candidate.baselineLogicalTokens);
  const candidateLogicalTokens = nullableNonNegative(candidate.candidateLogicalTokens);
  const cacheReadTokens = nonNegative(candidate.cacheReadTokens);
  const cacheWriteTokens = nonNegative(candidate.cacheWriteTokens);
  const fallbackTokens = nonNegative(candidate.fallbackTokens);
  const observedLogicalTokenDelta = baselineLogicalTokens !== null && candidateLogicalTokens !== null
    ? candidateLogicalTokens + fallbackTokens - baselineLogicalTokens
    : null;

  const stablePrefixRate = boundedRate(candidate.stablePrefixRate);
  const minimumStablePrefixRate = boundedRate(candidate.minimumStablePrefixRate) ?? 0;
  const sampleSize = Math.max(0, Math.trunc(candidate.sampleSize));

  let status: PromptCacheEconomicsStatus;
  if (candidate.cacheAccountingGate === "failed") status = "cache_accounting_failure";
  else if (candidate.cacheAccountingGate !== "verified") status = "cache_accounting_unverified";
  else if (stablePrefixRate !== null && stablePrefixRate < minimumStablePrefixRate) status = "prefix_instability";
  else if (candidate.qualityGate === "failed") status = "quality_regression";
  else if (measuredCostSavingsUsd !== null && measuredCostSavingsUsd < 0) status = "cost_regression";
  else if (baselineCostUsd === null || netCandidateCostUsd === null || baselineCostUsd === 0 || measuredCostSavingsUsd === 0) status = "no_cost_savings_evidence";
  else if (candidate.qualityGate !== "passed") status = "quality_unverified";
  else if (candidate.evidenceType !== "measured_before_after") status = "candidate";
  else if (sampleSize < minimumSampleSize) status = "insufficient_samples";
  else status = "verified_cost_savings";

  return {
    id: candidate.id,
    policyVersion: candidate.policyVersion?.trim() || null,
    status,
    costSavingsClaimable: status === "verified_cost_savings",
    tokenSavingsClaimable: false,
    claimClass: "cost_reduction_only",
    evidenceType: candidate.evidenceType,
    qualityGate: candidate.qualityGate,
    cacheAccountingGate: candidate.cacheAccountingGate,
    sampleSize,
    baselineCostUsd,
    candidateCostUsd,
    cacheControlOverheadCostUsd,
    fallbackCostUsd,
    netCandidateCostUsd,
    measuredCostSavingsUsd,
    measuredCostSavingsPct,
    baselineLogicalTokens,
    candidateLogicalTokens,
    cacheReadTokens,
    cacheWriteTokens,
    fallbackTokens,
    observedLogicalTokenDelta,
    stablePrefixRate,
    minimumStablePrefixRate,
    evidenceSource: candidate.evidenceSource?.trim() || null,
    verificationRequired: requirementFor(status, minimumSampleSize),
  };
}
