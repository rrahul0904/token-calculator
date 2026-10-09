export type BudgetEvidenceType = "measured_before_after" | "historical_observation" | "modeled_estimate" | "unknown";
export type BudgetQualityGate = "passed" | "failed" | "not_run";
export type BudgetEnforcementGate = "verified" | "failed" | "not_run";

export type BudgetControlStatus =
  | "verified_cost_savings"
  | "candidate"
  | "insufficient_samples"
  | "quality_unverified"
  | "quality_regression"
  | "enforcement_unverified"
  | "enforcement_failure"
  | "policy_bypass"
  | "budget_breach"
  | "required_work_denied"
  | "cost_regression"
  | "no_cost_savings_evidence";

export interface BudgetControlCandidate {
  id: string;
  policyVersion?: string | null;
  evidenceType: BudgetEvidenceType;
  qualityGate: BudgetQualityGate;
  enforcementGate: BudgetEnforcementGate;
  sampleSize: number;
  budgetLimitUsd: number;
  baselineCostUsd: number | null;
  candidateCostUsd: number | null;
  controlPlaneOverheadCostUsd?: number | null;
  baselineSessionTokens?: number | null;
  candidateSessionTokens?: number | null;
  hardLimitBreaches?: number;
  policyBypasses?: number;
  requiredWorkDenied?: number;
  evidenceSource?: string | null;
}

export interface BudgetControlEvaluation {
  id: string;
  policyVersion: string | null;
  status: BudgetControlStatus;
  costSavingsClaimable: boolean;
  tokenSavingsClaimable: false;
  claimClass: "cost_reduction_only";
  evidenceType: BudgetEvidenceType;
  qualityGate: BudgetQualityGate;
  enforcementGate: BudgetEnforcementGate;
  sampleSize: number;
  budgetLimitUsd: number;
  baselineCostUsd: number | null;
  candidateCostUsd: number | null;
  controlPlaneOverheadCostUsd: number;
  netCandidateCostUsd: number | null;
  measuredCostSavingsUsd: number | null;
  measuredCostSavingsPct: number | null;
  withinBudget: boolean | null;
  baselineSessionTokens: number | null;
  candidateSessionTokens: number | null;
  observedTokenDelta: number | null;
  hardLimitBreaches: number;
  policyBypasses: number;
  requiredWorkDenied: number;
  evidenceSource: string | null;
  verificationRequired: string | null;
}

function nullableNonNegative(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function nonNegative(value: number | null | undefined): number {
  return nullableNonNegative(value) ?? 0;
}

function nonNegativeInt(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function requirementFor(status: BudgetControlStatus, minimumSampleSize: number): string | null {
  switch (status) {
    case "verified_cost_savings": return null;
    case "enforcement_failure": return "Repair authoritative gateway/runtime budget enforcement before relying on this policy.";
    case "enforcement_unverified": return "Verify the budget at the authoritative execution boundary; advisory preflight checks are insufficient.";
    case "policy_bypass": return "Remove all observed policy bypasses and repeat the same evaluation cohort.";
    case "budget_breach": return "Eliminate hard-limit breaches and verify reservation/reconciliation at the configured budget boundary.";
    case "required_work_denied": return "Tune the policy so required outcome-equivalent work is not denied by the budget controller.";
    case "quality_regression": return "Fix the outcome-quality regression and repeat the same budget-policy cohort.";
    case "quality_unverified": return "Run an outcome-equivalence quality gate for baseline and budget-controlled cohorts.";
    case "cost_regression": return "Inspect control-plane overhead and fallback behavior; candidate cost exceeds baseline.";
    case "insufficient_samples": return `Collect at least ${minimumSampleSize} comparable measured budget-control samples.`;
    case "candidate": return "Capture measured same-cohort spend from authoritative receipts; modeled savings are not verified.";
    case "no_cost_savings_evidence": return "Capture valid baseline and candidate spend with a positive measured cost delta.";
  }
}

/**
 * Evidence gate for hard budget/control-plane products. Enforcing a ceiling is
 * valuable but does not itself prove token savings, so this contract exposes
 * verified cost savings only after authoritative enforcement, outcome parity
 * and measured same-cohort economics all pass.
 */
export function evaluateBudgetControl(
  candidate: BudgetControlCandidate,
  options: { minimumSampleSize?: number } = {},
): BudgetControlEvaluation {
  const minimumSampleSize = Math.max(1, Math.trunc(options.minimumSampleSize ?? 5));
  const budgetLimitUsd = nonNegative(candidate.budgetLimitUsd);
  const baselineCostUsd = nullableNonNegative(candidate.baselineCostUsd);
  const candidateCostUsd = nullableNonNegative(candidate.candidateCostUsd);
  const controlPlaneOverheadCostUsd = nonNegative(candidate.controlPlaneOverheadCostUsd);
  const netCandidateCostUsd = candidateCostUsd === null ? null : candidateCostUsd + controlPlaneOverheadCostUsd;
  const measuredCostSavingsUsd = baselineCostUsd !== null && netCandidateCostUsd !== null ? baselineCostUsd - netCandidateCostUsd : null;
  const measuredCostSavingsPct = measuredCostSavingsUsd !== null && baselineCostUsd !== null && baselineCostUsd > 0
    ? round((measuredCostSavingsUsd / baselineCostUsd) * 100)
    : null;
  const withinBudget = netCandidateCostUsd === null ? null : netCandidateCostUsd <= budgetLimitUsd;

  const baselineSessionTokens = nullableNonNegative(candidate.baselineSessionTokens);
  const candidateSessionTokens = nullableNonNegative(candidate.candidateSessionTokens);
  const observedTokenDelta = baselineSessionTokens !== null && candidateSessionTokens !== null
    ? candidateSessionTokens - baselineSessionTokens
    : null;
  const hardLimitBreaches = nonNegativeInt(candidate.hardLimitBreaches);
  const policyBypasses = nonNegativeInt(candidate.policyBypasses);
  const requiredWorkDenied = nonNegativeInt(candidate.requiredWorkDenied);
  const sampleSize = Math.max(0, Math.trunc(candidate.sampleSize));

  let status: BudgetControlStatus;
  if (candidate.enforcementGate === "failed") status = "enforcement_failure";
  else if (candidate.enforcementGate !== "verified") status = "enforcement_unverified";
  else if (policyBypasses > 0) status = "policy_bypass";
  else if (hardLimitBreaches > 0 || withinBudget === false) status = "budget_breach";
  else if (requiredWorkDenied > 0) status = "required_work_denied";
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
    enforcementGate: candidate.enforcementGate,
    sampleSize,
    budgetLimitUsd,
    baselineCostUsd,
    candidateCostUsd,
    controlPlaneOverheadCostUsd,
    netCandidateCostUsd,
    measuredCostSavingsUsd,
    measuredCostSavingsPct,
    withinBudget,
    baselineSessionTokens,
    candidateSessionTokens,
    observedTokenDelta,
    hardLimitBreaches,
    policyBypasses,
    requiredWorkDenied,
    evidenceSource: candidate.evidenceSource?.trim() || null,
    verificationRequired: requirementFor(status, minimumSampleSize),
  };
}
