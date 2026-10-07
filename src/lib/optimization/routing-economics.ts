export type RoutingEvidenceType = "measured_before_after" | "historical_observation" | "modeled_estimate" | "unknown";
export type RoutingQualityGate = "passed" | "failed" | "not_run";
export type RoutingProvenanceGate = "verified" | "failed" | "not_run";

export type RoutingEconomicsStatus =
  | "verified_cost_savings"
  | "candidate"
  | "insufficient_samples"
  | "quality_unverified"
  | "quality_regression"
  | "route_provenance_unverified"
  | "route_provenance_failure"
  | "cost_regression"
  | "no_cost_savings_evidence";

export interface RoutingEconomicsCandidate {
  id: string;
  policyVersion?: string | null;
  evidenceType: RoutingEvidenceType;
  qualityGate: RoutingQualityGate;
  routeProvenanceGate: RoutingProvenanceGate;
  sampleSize: number;
  baselineCostUsd: number | null;
  candidateCostUsd: number | null;
  routingOverheadCostUsd?: number | null;
  fallbackCostUsd?: number | null;
  baselineTokens?: number | null;
  candidateTokens?: number | null;
  fallbackTokens?: number | null;
  baselineRoute?: string | null;
  resolvedRoutes?: string[];
  requiredExactRoute?: boolean;
  silentSubstitutionObserved?: boolean;
  evidenceSource?: string | null;
}

export interface RoutingEconomicsEvaluation {
  id: string;
  policyVersion: string | null;
  status: RoutingEconomicsStatus;
  costSavingsClaimable: boolean;
  tokenSavingsClaimable: false;
  claimClass: "cost_reduction_only";
  evidenceType: RoutingEvidenceType;
  qualityGate: RoutingQualityGate;
  routeProvenanceGate: RoutingProvenanceGate;
  sampleSize: number;
  baselineCostUsd: number | null;
  candidateCostUsd: number | null;
  routingOverheadCostUsd: number;
  fallbackCostUsd: number;
  netCandidateCostUsd: number | null;
  measuredCostSavingsUsd: number | null;
  measuredCostSavingsPct: number | null;
  baselineTokens: number | null;
  candidateTokens: number | null;
  fallbackTokens: number;
  observedTokenDelta: number | null;
  baselineRoute: string | null;
  resolvedRoutes: string[];
  requiredExactRoute: boolean;
  silentSubstitutionObserved: boolean;
  evidenceSource: string | null;
  verificationRequired: string | null;
}

function nullableNonNegative(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function nonNegative(value: number | null | undefined): number {
  return nullableNonNegative(value) ?? 0;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function requirementFor(status: RoutingEconomicsStatus, minimumSampleSize: number): string | null {
  switch (status) {
    case "verified_cost_savings":
      return null;
    case "route_provenance_failure":
      return "Remove silent route substitution and capture authoritative provider/model route evidence.";
    case "route_provenance_unverified":
      return "Verify resolved provider/model routes from gateway/provider telemetry rather than worker self-report.";
    case "quality_regression":
      return "Fix the outcome-quality regression and repeat the same evaluation cohort.";
    case "quality_unverified":
      return "Run the same task-quality gate for baseline and routed candidates.";
    case "cost_regression":
      return "Investigate routing overhead and fallback spend; candidate cost exceeds baseline.";
    case "insufficient_samples":
      return `Collect at least ${minimumSampleSize} comparable measured routing samples.`;
    case "candidate":
      return "Capture measured cost evidence from the same cohort; modeled/historical economics are not verified savings.";
    case "no_cost_savings_evidence":
      return "Capture valid baseline/candidate cost totals with a positive measured cost delta.";
  }
}

/**
 * Cost-routing evidence for RouteLLM/LiteLLM/free-router/delegation style
 * techniques. This contract intentionally never exposes a token-savings claim:
 * moving work to a cheaper model/provider can reduce spend while using the same
 * or more tokens.
 */
export function evaluateRoutingEconomics(
  candidate: RoutingEconomicsCandidate,
  options: { minimumSampleSize?: number } = {},
): RoutingEconomicsEvaluation {
  const minimumSampleSize = Math.max(1, Math.trunc(options.minimumSampleSize ?? 5));
  const baselineCostUsd = nullableNonNegative(candidate.baselineCostUsd);
  const candidateCostUsd = nullableNonNegative(candidate.candidateCostUsd);
  const routingOverheadCostUsd = nonNegative(candidate.routingOverheadCostUsd);
  const fallbackCostUsd = nonNegative(candidate.fallbackCostUsd);
  const netCandidateCostUsd = candidateCostUsd === null
    ? null
    : candidateCostUsd + routingOverheadCostUsd + fallbackCostUsd;
  const measuredCostSavingsUsd = baselineCostUsd !== null && netCandidateCostUsd !== null
    ? baselineCostUsd - netCandidateCostUsd
    : null;
  const measuredCostSavingsPct = measuredCostSavingsUsd !== null && baselineCostUsd !== null && baselineCostUsd > 0
    ? round((measuredCostSavingsUsd / baselineCostUsd) * 100, 2)
    : null;

  const baselineTokens = nullableNonNegative(candidate.baselineTokens);
  const candidateTokens = nullableNonNegative(candidate.candidateTokens);
  const fallbackTokens = nonNegative(candidate.fallbackTokens);
  const observedTokenDelta = baselineTokens !== null && candidateTokens !== null
    ? (candidateTokens + fallbackTokens) - baselineTokens
    : null;
  const sampleSize = Math.max(0, Math.trunc(candidate.sampleSize));
  const requiredExactRoute = candidate.requiredExactRoute ?? true;
  const silentSubstitutionObserved = candidate.silentSubstitutionObserved ?? false;
  const resolvedRoutes = [...new Set((candidate.resolvedRoutes ?? []).map((route) => route.trim()).filter(Boolean))].sort();

  let status: RoutingEconomicsStatus;
  if (candidate.routeProvenanceGate === "failed" || (requiredExactRoute && silentSubstitutionObserved)) status = "route_provenance_failure";
  else if (candidate.routeProvenanceGate !== "verified") status = "route_provenance_unverified";
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
    routeProvenanceGate: candidate.routeProvenanceGate,
    sampleSize,
    baselineCostUsd,
    candidateCostUsd,
    routingOverheadCostUsd,
    fallbackCostUsd,
    netCandidateCostUsd,
    measuredCostSavingsUsd,
    measuredCostSavingsPct,
    baselineTokens,
    candidateTokens,
    fallbackTokens,
    observedTokenDelta,
    baselineRoute: candidate.baselineRoute?.trim() || null,
    resolvedRoutes,
    requiredExactRoute,
    silentSubstitutionObserved,
    evidenceSource: candidate.evidenceSource?.trim() || null,
    verificationRequired: requirementFor(status, minimumSampleSize),
  };
}
