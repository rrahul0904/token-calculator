import type {
  NormalizedPortfolioDecision,
  TokenSavingAnalysisKind,
} from "./portfolio-analysis";

export type ExperimentReadiness =
  | "already_verified"
  | "benchmark_ready"
  | "evidence_required"
  | "remediation_required";

export interface OptimizationExperimentRecommendation {
  candidateId: string;
  kind: TokenSavingAnalysisKind;
  claimClass: NormalizedPortfolioDecision["claimClass"];
  readiness: ExperimentReadiness;
  priority: "none" | "low" | "medium" | "high";
  recommendedSampleSize: number;
  workloadRule: "same_versioned_cohort";
  measurementScope: "full_session";
  requiredEvidence: string[];
  acceptanceCriteria: string[];
  currentBlocker: string | null;
  autoActivate: false;
  activationPolicy: "manual_after_verified_evidence";
}

const REMEDIATION_STATUSES = new Set([
  "quality_regression",
  "token_regression",
  "cost_regression",
  "signal_loss",
  "retrieval_failure",
  "stale_index",
  "fidelity_failure",
  "false_hit_regression",
  "stale_cache",
  "tenant_isolation_failure",
  "evidence_loss",
  "cache_prefix_regression",
  "isolation_failure",
  "provenance_failure",
  "stale_memory",
  "contradiction_regression",
  "route_provenance_failure",
]);

const EVIDENCE_STATUSES = new Set([
  "quality_unverified",
  "fidelity_unverified",
  "tenant_isolation_unverified",
  "isolation_unverified",
  "provenance_unverified",
  "route_provenance_unverified",
  "no_savings_evidence",
  "no_cost_savings_evidence",
  "plan_evidence_required",
]);

function evidenceFor(kind: TokenSavingAnalysisKind): string[] {
  const shared = [
    "authoritative baseline and candidate run receipts",
    "same versioned evaluation cohort",
    "terminal run evidence",
    "outcome-equivalent quality evidence",
  ];
  switch (kind) {
    case "routing_economics":
      return [...shared, "authoritative provider/model route provenance", "measured baseline and candidate cost"];
    case "semantic_cache":
      return [...shared, "tenant/authorization isolation evidence", "cache freshness/invalidation evidence", "false-hit observations"];
    case "persistent_memory":
      return [...shared, "tenant/project isolation evidence", "memory provenance", "freshness and contradiction checks"];
    case "repository_context":
      return [...shared, "index freshness", "required-evidence retrieval coverage", "fallback-read accounting"];
    case "structured_encoding":
      return [...shared, "round-trip fidelity evidence", "required-field preservation", "format/repair/retry overhead"];
    case "context_compression":
      return [...shared, "required-evidence preservation", "compressor-model overhead", "cache-prefix behavior"];
    case "output_reduction":
      return [...shared, "required error/warning signal preservation", "reducer/retry overhead"];
    case "response_density":
      return [...shared, "policy persistence", "required response-class preservation", "clarification/retry overhead"];
    case "optimizer_plan":
      return [...shared, "complete plan-level receipts", "component interaction evidence", "no summed component savings"];
  }
}

function criteriaFor(decision: NormalizedPortfolioDecision): string[] {
  if (decision.claimClass === "cost_reduction_only") {
    return [
      "candidate quality is non-inferior to baseline",
      "resolved route provenance matches policy",
      "measured candidate cost including routing/fallback overhead is below baseline",
      "result remains classified as cost savings, not token savings",
    ];
  }
  return [
    "candidate quality is non-inferior to baseline",
    "all technique-specific correctness gates pass",
    "measured full-session candidate tokens including overhead are below baseline",
    "no unresolved retry, fallback, stale-evidence, isolation or provenance regression remains",
  ];
}

function readinessFor(decision: NormalizedPortfolioDecision): ExperimentReadiness {
  if (decision.claimable) return "already_verified";
  if (REMEDIATION_STATUSES.has(decision.status)) return "remediation_required";
  if (EVIDENCE_STATUSES.has(decision.status)) return "evidence_required";
  return "benchmark_ready";
}

function priorityFor(readiness: ExperimentReadiness): OptimizationExperimentRecommendation["priority"] {
  if (readiness === "already_verified") return "none";
  if (readiness === "remediation_required") return "high";
  if (readiness === "evidence_required") return "medium";
  return "low";
}

/**
 * Produce bounded experiment recommendations without activating or installing
 * any optimizer. The recommendations describe evidence needed for promotion;
 * an external policy/review step must still authorize configuration changes.
 */
export function recommendOptimizationExperiments(
  decisions: readonly NormalizedPortfolioDecision[],
  options: { minimumSampleSize?: number; limit?: number } = {},
): OptimizationExperimentRecommendation[] {
  const recommendedSampleSize = Math.max(5, Math.trunc(options.minimumSampleSize ?? 5));
  const limit = Math.max(1, Math.trunc(options.limit ?? 20));

  return decisions
    .map((decision) => {
      const readiness = readinessFor(decision);
      return {
        candidateId: decision.id,
        kind: decision.kind,
        claimClass: decision.claimClass,
        readiness,
        priority: priorityFor(readiness),
        recommendedSampleSize,
        workloadRule: "same_versioned_cohort" as const,
        measurementScope: "full_session" as const,
        requiredEvidence: evidenceFor(decision.kind),
        acceptanceCriteria: criteriaFor(decision),
        currentBlocker: decision.verificationRequired,
        autoActivate: false as const,
        activationPolicy: "manual_after_verified_evidence" as const,
      };
    })
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2, none: 3 } as const;
      return rank[a.priority] - rank[b.priority] || a.candidateId.localeCompare(b.candidateId);
    })
    .slice(0, limit);
}
