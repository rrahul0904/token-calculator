export type HarnessOptimizationKind =
  | "output_reducer"
  | "lazy_tool_catalog"
  | "context_compaction"
  | "repository_context";

export type HarnessEvidenceType =
  | "measured_before_after"
  | "historical_observation"
  | "modeled_estimate"
  | "unknown";

export type HarnessQualityGate = "passed" | "failed" | "not_run";

export type HarnessEvaluationStatus =
  | "verified_savings"
  | "candidate"
  | "insufficient_samples"
  | "quality_unverified"
  | "quality_regression"
  | "token_regression"
  | "no_savings_evidence";

export interface HarnessOptimizationCandidate {
  id: string;
  kind: HarnessOptimizationKind;
  label?: string;
  baselineTokens: number | null;
  deliveredTokens: number | null;
  sampleSize: number;
  evidenceType: HarnessEvidenceType;
  qualityGate: HarnessQualityGate;
  evidenceSource?: string | null;
}

export interface HarnessOptimizationEvaluation {
  id: string;
  kind: HarnessOptimizationKind;
  label: string;
  status: HarnessEvaluationStatus;
  claimable: boolean;
  baselineTokens: number | null;
  deliveredTokens: number | null;
  measuredSavingsTokens: number | null;
  measuredSavingsPct: number | null;
  sampleSize: number;
  evidenceType: HarnessEvidenceType;
  qualityGate: HarnessQualityGate;
  evidenceSource: string | null;
  recommendation: string;
  verificationRequired: string | null;
}

export interface HarnessOptimizationReport {
  version: 1;
  minimumSampleSize: number;
  privacy: {
    metadataOnly: true;
    promptContentRequired: false;
    sourceCodeRequired: false;
    rawToolOutputRequired: false;
  };
  summary: {
    candidates: number;
    verifiedComponents: number;
    regressions: number;
    bestVerifiedSavingsPct: number | null;
    bestVerifiedComponentId: string | null;
    additiveSavingsClaimed: false;
    aggregateSavingsTokens: null;
    note: string;
  };
  evaluations: HarnessOptimizationEvaluation[];
}

const KIND_RECOMMENDATIONS: Record<HarnessOptimizationKind, string> = {
  output_reducer: "Reduce noisy tool or shell output while preserving failures, warnings and decision-relevant summaries.",
  lazy_tool_catalog: "Expose tool schemas on demand instead of paying the full tool-catalog context cost on every turn.",
  context_compaction: "Compress large context/tool payloads behind a deterministic boundary and verify task quality before adoption.",
  repository_context: "Use repository structure or relationship metadata to reduce repeated exploratory reads without sending source content to this evaluator.",
};

function normalizeTokenCount(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

function round(value: number, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function verificationFor(candidate: HarnessOptimizationCandidate, minimumSampleSize: number): string | null {
  if (candidate.qualityGate === "failed") return "Fix the quality regression and repeat the same versioned workload before considering this optimizer.";
  if (candidate.qualityGate !== "passed") return "Run an outcome-equivalent quality gate on the same versioned workload.";
  if (candidate.evidenceType !== "measured_before_after") return "Capture measured before/after token counts from the same workload; estimates and historical observations are not verified savings.";
  if (candidate.sampleSize < minimumSampleSize) return `Collect at least ${minimumSampleSize} comparable measured samples before claiming savings.`;
  if (normalizeTokenCount(candidate.baselineTokens) === null || normalizeTokenCount(candidate.deliveredTokens) === null) return "Capture non-negative baseline and delivered token counts.";
  return null;
}

export function evaluateHarnessCandidate(
  candidate: HarnessOptimizationCandidate,
  options: { minimumSampleSize?: number } = {},
): HarnessOptimizationEvaluation {
  const minimumSampleSize = Math.max(1, Math.trunc(options.minimumSampleSize ?? 5));
  const baselineTokens = normalizeTokenCount(candidate.baselineTokens);
  const deliveredTokens = normalizeTokenCount(candidate.deliveredTokens);
  const measuredSavingsTokens = baselineTokens !== null && deliveredTokens !== null
    ? baselineTokens - deliveredTokens
    : null;
  const measuredSavingsPct = measuredSavingsTokens !== null && baselineTokens !== null && baselineTokens > 0
    ? round(measuredSavingsTokens / baselineTokens * 100)
    : null;

  let status: HarnessEvaluationStatus;
  if (candidate.qualityGate === "failed") status = "quality_regression";
  else if (measuredSavingsTokens !== null && measuredSavingsTokens < 0) status = "token_regression";
  else if (baselineTokens === null || deliveredTokens === null || baselineTokens === 0 || measuredSavingsTokens === 0) status = "no_savings_evidence";
  else if (candidate.qualityGate !== "passed") status = "quality_unverified";
  else if (candidate.evidenceType !== "measured_before_after") status = "candidate";
  else if (candidate.sampleSize < minimumSampleSize) status = "insufficient_samples";
  else status = "verified_savings";

  const claimable = status === "verified_savings";
  return {
    id: candidate.id,
    kind: candidate.kind,
    label: candidate.label?.trim() || candidate.id,
    status,
    claimable,
    baselineTokens,
    deliveredTokens,
    measuredSavingsTokens,
    measuredSavingsPct,
    sampleSize: Math.max(0, Math.trunc(candidate.sampleSize)),
    evidenceType: candidate.evidenceType,
    qualityGate: candidate.qualityGate,
    evidenceSource: candidate.evidenceSource?.trim() || null,
    recommendation: KIND_RECOMMENDATIONS[candidate.kind],
    verificationRequired: claimable ? null : verificationFor(candidate, minimumSampleSize),
  };
}

export function evaluateHarnessOptimizations(
  candidates: HarnessOptimizationCandidate[],
  options: { minimumSampleSize?: number } = {},
): HarnessOptimizationReport {
  const minimumSampleSize = Math.max(1, Math.trunc(options.minimumSampleSize ?? 5));
  const evaluations = candidates.map((candidate) => evaluateHarnessCandidate(candidate, { minimumSampleSize }));
  const verified = evaluations.filter((evaluation) => evaluation.claimable);
  const best = [...verified]
    .filter((evaluation) => evaluation.measuredSavingsPct !== null)
    .sort((a, b) => (b.measuredSavingsPct ?? 0) - (a.measuredSavingsPct ?? 0))[0] ?? null;
  const regressions = evaluations.filter((evaluation) => evaluation.status === "quality_regression" || evaluation.status === "token_regression").length;

  return {
    version: 1,
    minimumSampleSize,
    privacy: {
      metadataOnly: true,
      promptContentRequired: false,
      sourceCodeRequired: false,
      rawToolOutputRequired: false,
    },
    summary: {
      candidates: evaluations.length,
      verifiedComponents: verified.length,
      regressions,
      bestVerifiedSavingsPct: best?.measuredSavingsPct ?? null,
      bestVerifiedComponentId: best?.id ?? null,
      additiveSavingsClaimed: false,
      aggregateSavingsTokens: null,
      note: "Component opportunities may overlap. Token Intelligence intentionally does not sum them into a universal harness-savings claim.",
    },
    evaluations,
  };
}
