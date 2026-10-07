export type OptimizerPlanEvidenceType = "measured_before_after" | "historical_observation" | "modeled_estimate" | "unknown";
export type OptimizerPlanQualityGate = "passed" | "failed" | "not_run";
export type OptimizerComponentClaimClass = "token_reduction_candidate" | "mixed_token_and_cost_candidate" | "cost_reduction_only";

export type OptimizerPlanStatus =
  | "verified_plan_savings"
  | "candidate"
  | "insufficient_samples"
  | "quality_unverified"
  | "quality_regression"
  | "token_regression"
  | "plan_evidence_required"
  | "no_savings_evidence";

export interface OptimizerPlanComponent {
  id: string;
  familyKey: string;
  claimClass: OptimizerComponentClaimClass;
  individualClaimable: boolean;
  individualSavingsPct?: number | null;
}

export interface OptimizerPlanCandidate {
  id: string;
  components: OptimizerPlanComponent[];
  evidenceType: OptimizerPlanEvidenceType;
  qualityGate: OptimizerPlanQualityGate;
  sampleSize: number;
  baselineSessionTokens: number | null;
  candidateSessionTokens: number | null;
  baselineCostUsd?: number | null;
  candidateCostUsd?: number | null;
  evidenceSource?: string | null;
}

export interface OptimizerPlanEvaluation {
  id: string;
  status: OptimizerPlanStatus;
  tokenSavingsClaimable: boolean;
  evidenceType: OptimizerPlanEvidenceType;
  qualityGate: OptimizerPlanQualityGate;
  sampleSize: number;
  components: OptimizerPlanComponent[];
  componentCount: number;
  overlappingFamilyKeys: string[];
  allComponentsIndividuallyClaimable: boolean;
  componentSavingsSummed: false;
  summedComponentSavingsPct: null;
  baselineSessionTokens: number | null;
  candidateSessionTokens: number | null;
  measuredPlanSavingsTokens: number | null;
  measuredPlanSavingsPct: number | null;
  baselineCostUsd: number | null;
  candidateCostUsd: number | null;
  measuredPlanCostSavingsUsd: number | null;
  measuredPlanCostSavingsPct: number | null;
  evidenceSource: string | null;
  verificationRequired: string | null;
}

function nullableNonNegative(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function findOverlappingFamilies(components: OptimizerPlanComponent[]): string[] {
  const counts = new Map<string, number>();
  for (const component of components) {
    const familyKey = component.familyKey.trim();
    if (!familyKey) continue;
    counts.set(familyKey, (counts.get(familyKey) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([familyKey]) => familyKey)
    .sort();
}

function requirementFor(status: OptimizerPlanStatus, minimumSampleSize: number): string | null {
  switch (status) {
    case "verified_plan_savings":
      return null;
    case "quality_regression":
      return "Fix the combined-plan outcome regression and repeat the same evaluation cohort.";
    case "quality_unverified":
      return "Run one outcome-equivalent quality gate for the complete optimization plan.";
    case "token_regression":
      return "The combined plan uses more session tokens than baseline; inspect component interactions and fallbacks.";
    case "insufficient_samples":
      return `Collect at least ${minimumSampleSize} comparable measured plan-level samples.`;
    case "candidate":
      return "Capture measured same-cohort full-session receipts for the complete plan; individual component evidence is insufficient.";
    case "plan_evidence_required":
      return "Benchmark the complete combination as one candidate. Do not add component savings percentages.";
    case "no_savings_evidence":
      return "Capture valid baseline/candidate plan-level token totals with a positive measured delta.";
  }
}

/**
 * Evaluates a combination of optimizers. Individual component percentages are
 * intentionally never summed because output reduction, context compression,
 * caching, retrieval and routing can overlap or change each other's behavior.
 * Only measured same-cohort plan-level evidence can verify combined savings.
 */
export function evaluateOptimizerPlan(
  candidate: OptimizerPlanCandidate,
  options: { minimumSampleSize?: number } = {},
): OptimizerPlanEvaluation {
  const minimumSampleSize = Math.max(1, Math.trunc(options.minimumSampleSize ?? 5));
  const components = candidate.components.map((component) => ({
    ...component,
    id: component.id.trim(),
    familyKey: component.familyKey.trim(),
    individualSavingsPct: nullableNonNegative(component.individualSavingsPct),
  }));
  const overlappingFamilyKeys = findOverlappingFamilies(components);
  const allComponentsIndividuallyClaimable = components.length > 0 && components.every((component) => component.individualClaimable);

  const baselineSessionTokens = nullableNonNegative(candidate.baselineSessionTokens);
  const candidateSessionTokens = nullableNonNegative(candidate.candidateSessionTokens);
  const measuredPlanSavingsTokens = baselineSessionTokens !== null && candidateSessionTokens !== null
    ? baselineSessionTokens - candidateSessionTokens
    : null;
  const measuredPlanSavingsPct = measuredPlanSavingsTokens !== null && baselineSessionTokens !== null && baselineSessionTokens > 0
    ? round((measuredPlanSavingsTokens / baselineSessionTokens) * 100)
    : null;

  const baselineCostUsd = nullableNonNegative(candidate.baselineCostUsd);
  const candidateCostUsd = nullableNonNegative(candidate.candidateCostUsd);
  const measuredPlanCostSavingsUsd = baselineCostUsd !== null && candidateCostUsd !== null
    ? baselineCostUsd - candidateCostUsd
    : null;
  const measuredPlanCostSavingsPct = measuredPlanCostSavingsUsd !== null && baselineCostUsd !== null && baselineCostUsd > 0
    ? round((measuredPlanCostSavingsUsd / baselineCostUsd) * 100)
    : null;
  const sampleSize = Math.max(0, Math.trunc(candidate.sampleSize));

  let status: OptimizerPlanStatus;
  if (candidate.qualityGate === "failed") status = "quality_regression";
  else if (measuredPlanSavingsTokens !== null && measuredPlanSavingsTokens < 0) status = "token_regression";
  else if (candidate.evidenceType === "unknown" && components.length > 1) status = "plan_evidence_required";
  else if (baselineSessionTokens === null || candidateSessionTokens === null || baselineSessionTokens === 0 || measuredPlanSavingsTokens === 0) status = "no_savings_evidence";
  else if (candidate.qualityGate !== "passed") status = "quality_unverified";
  else if (candidate.evidenceType !== "measured_before_after") status = "candidate";
  else if (sampleSize < minimumSampleSize) status = "insufficient_samples";
  else status = "verified_plan_savings";

  return {
    id: candidate.id,
    status,
    tokenSavingsClaimable: status === "verified_plan_savings",
    evidenceType: candidate.evidenceType,
    qualityGate: candidate.qualityGate,
    sampleSize,
    components,
    componentCount: components.length,
    overlappingFamilyKeys,
    allComponentsIndividuallyClaimable,
    componentSavingsSummed: false,
    summedComponentSavingsPct: null,
    baselineSessionTokens,
    candidateSessionTokens,
    measuredPlanSavingsTokens,
    measuredPlanSavingsPct,
    baselineCostUsd,
    candidateCostUsd,
    measuredPlanCostSavingsUsd,
    measuredPlanCostSavingsPct,
    evidenceSource: candidate.evidenceSource?.trim() || null,
    verificationRequired: requirementFor(status, minimumSampleSize),
  };
}
