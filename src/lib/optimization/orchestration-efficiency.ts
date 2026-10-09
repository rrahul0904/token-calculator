export type OrchestrationEvidenceType = "measured_before_after" | "historical_observation" | "modeled_estimate" | "unknown";
export type OrchestrationQualityGate = "passed" | "failed" | "not_run";
export type OrchestrationProvenanceGate = "verified" | "failed" | "not_run";

export type OrchestrationEfficiencyStatus =
  | "verified_savings"
  | "candidate"
  | "insufficient_samples"
  | "quality_unverified"
  | "quality_regression"
  | "provenance_unverified"
  | "provenance_failure"
  | "fanout_guardrail_breach"
  | "token_regression"
  | "no_savings_evidence";

export interface OrchestrationEfficiencyCandidate {
  id: string;
  orchestrationVersion?: string | null;
  evidenceType: OrchestrationEvidenceType;
  qualityGate: OrchestrationQualityGate;
  provenanceGate: OrchestrationProvenanceGate;
  sampleSize: number;
  baselineSessionTokens: number | null;
  candidateWorkerTokens: number | null;
  coordinatorTokens?: number | null;
  handoffTokens?: number | null;
  retryTokens?: number | null;
  fallbackTokens?: number | null;
  baselineCostUsd?: number | null;
  candidateWorkerCostUsd?: number | null;
  coordinatorCostUsd?: number | null;
  fallbackCostUsd?: number | null;
  observedMaxFanout?: number;
  maxAllowedFanout?: number;
  evidenceSource?: string | null;
}

export interface OrchestrationEfficiencyEvaluation {
  id: string;
  orchestrationVersion: string | null;
  status: OrchestrationEfficiencyStatus;
  claimable: boolean;
  evidenceType: OrchestrationEvidenceType;
  qualityGate: OrchestrationQualityGate;
  provenanceGate: OrchestrationProvenanceGate;
  sampleSize: number;
  baselineSessionTokens: number | null;
  candidateWorkerTokens: number | null;
  coordinatorTokens: number;
  handoffTokens: number;
  retryTokens: number;
  fallbackTokens: number;
  netCandidateSessionTokens: number | null;
  measuredSavingsTokens: number | null;
  measuredSavingsPct: number | null;
  baselineCostUsd: number | null;
  candidateWorkerCostUsd: number | null;
  coordinatorCostUsd: number;
  fallbackCostUsd: number;
  netCandidateCostUsd: number | null;
  measuredCostDeltaUsd: number | null;
  observedMaxFanout: number;
  maxAllowedFanout: number;
  evidenceSource: string | null;
  verificationRequired: string | null;
}

function nullableNonNegative(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function nonNegative(value: number | null | undefined): number {
  return nullableNonNegative(value) ?? 0;
}

function nonNegativeInt(value: number | undefined, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? fallback)) : fallback;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function requirementFor(status: OrchestrationEfficiencyStatus, minimumSampleSize: number): string | null {
  switch (status) {
    case "verified_savings": return null;
    case "provenance_failure": return "Repair missing or contradictory worker/coordinator receipts before evaluating orchestration economics.";
    case "provenance_unverified": return "Verify all worker, coordinator, handoff, retry and fallback usage from authoritative receipts.";
    case "fanout_guardrail_breach": return "Bound delegation fanout and repeat the same workload before adoption.";
    case "quality_regression": return "Fix the outcome-quality regression and repeat the same orchestration cohort.";
    case "quality_unverified": return "Run an outcome-equivalence quality gate across baseline and orchestrated cohorts.";
    case "token_regression": return "Reduce coordinator, handoff, retry or fallback overhead; the orchestrated candidate uses more session tokens.";
    case "insufficient_samples": return `Collect at least ${minimumSampleSize} comparable measured orchestration samples.`;
    case "candidate": return "Capture measured same-cohort full-session receipts; modeled orchestration savings are not verified.";
    case "no_savings_evidence": return "Capture valid baseline and orchestrated token totals with a positive measured full-session delta.";
  }
}

/**
 * Evidence gate for delegation/agent-OS token optimization. Every coordinator,
 * handoff, retry and fallback token is charged to the candidate; worker-only
 * reductions cannot establish session savings. Bounded fanout, authoritative
 * provenance and outcome parity are mandatory.
 */
export function evaluateOrchestrationEfficiency(
  candidate: OrchestrationEfficiencyCandidate,
  options: { minimumSampleSize?: number } = {},
): OrchestrationEfficiencyEvaluation {
  const minimumSampleSize = Math.max(1, Math.trunc(options.minimumSampleSize ?? 5));
  const baselineSessionTokens = nullableNonNegative(candidate.baselineSessionTokens);
  const candidateWorkerTokens = nullableNonNegative(candidate.candidateWorkerTokens);
  const coordinatorTokens = nonNegative(candidate.coordinatorTokens);
  const handoffTokens = nonNegative(candidate.handoffTokens);
  const retryTokens = nonNegative(candidate.retryTokens);
  const fallbackTokens = nonNegative(candidate.fallbackTokens);
  const netCandidateSessionTokens = candidateWorkerTokens === null
    ? null
    : candidateWorkerTokens + coordinatorTokens + handoffTokens + retryTokens + fallbackTokens;
  const measuredSavingsTokens = baselineSessionTokens !== null && netCandidateSessionTokens !== null
    ? baselineSessionTokens - netCandidateSessionTokens
    : null;
  const measuredSavingsPct = measuredSavingsTokens !== null && baselineSessionTokens !== null && baselineSessionTokens > 0
    ? round((measuredSavingsTokens / baselineSessionTokens) * 100)
    : null;

  const baselineCostUsd = nullableNonNegative(candidate.baselineCostUsd);
  const candidateWorkerCostUsd = nullableNonNegative(candidate.candidateWorkerCostUsd);
  const coordinatorCostUsd = nonNegative(candidate.coordinatorCostUsd);
  const fallbackCostUsd = nonNegative(candidate.fallbackCostUsd);
  const netCandidateCostUsd = candidateWorkerCostUsd === null ? null : candidateWorkerCostUsd + coordinatorCostUsd + fallbackCostUsd;
  const measuredCostDeltaUsd = baselineCostUsd !== null && netCandidateCostUsd !== null ? netCandidateCostUsd - baselineCostUsd : null;

  const observedMaxFanout = nonNegativeInt(candidate.observedMaxFanout);
  const maxAllowedFanout = Math.max(1, nonNegativeInt(candidate.maxAllowedFanout, 8));
  const sampleSize = Math.max(0, Math.trunc(candidate.sampleSize));

  let status: OrchestrationEfficiencyStatus;
  if (candidate.provenanceGate === "failed") status = "provenance_failure";
  else if (candidate.provenanceGate !== "verified") status = "provenance_unverified";
  else if (observedMaxFanout > maxAllowedFanout) status = "fanout_guardrail_breach";
  else if (candidate.qualityGate === "failed") status = "quality_regression";
  else if (measuredSavingsTokens !== null && measuredSavingsTokens < 0) status = "token_regression";
  else if (baselineSessionTokens === null || netCandidateSessionTokens === null || baselineSessionTokens === 0 || measuredSavingsTokens === 0) status = "no_savings_evidence";
  else if (candidate.qualityGate !== "passed") status = "quality_unverified";
  else if (candidate.evidenceType !== "measured_before_after") status = "candidate";
  else if (sampleSize < minimumSampleSize) status = "insufficient_samples";
  else status = "verified_savings";

  return {
    id: candidate.id,
    orchestrationVersion: candidate.orchestrationVersion?.trim() || null,
    status,
    claimable: status === "verified_savings",
    evidenceType: candidate.evidenceType,
    qualityGate: candidate.qualityGate,
    provenanceGate: candidate.provenanceGate,
    sampleSize,
    baselineSessionTokens,
    candidateWorkerTokens,
    coordinatorTokens,
    handoffTokens,
    retryTokens,
    fallbackTokens,
    netCandidateSessionTokens,
    measuredSavingsTokens,
    measuredSavingsPct,
    baselineCostUsd,
    candidateWorkerCostUsd,
    coordinatorCostUsd,
    fallbackCostUsd,
    netCandidateCostUsd,
    measuredCostDeltaUsd,
    observedMaxFanout,
    maxAllowedFanout,
    evidenceSource: candidate.evidenceSource?.trim() || null,
    verificationRequired: requirementFor(status, minimumSampleSize),
  };
}
