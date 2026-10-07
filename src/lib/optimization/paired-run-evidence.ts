import {
  resolveExperimentEconomics,
  type LinkedRunEconomics,
} from "@/lib/evaluations/run-economics";
import type { OptimizerPlanCandidate, OptimizerPlanComponent } from "./optimizer-plan";
import type { RoutingEconomicsCandidate } from "./routing-economics";

export type PairedRunEvidenceBlocker =
  | "duplicate_case_id"
  | "duplicate_run_id"
  | "mismatched_case_id"
  | "non_terminal_run"
  | "baseline_usage_unverified"
  | "candidate_usage_unverified"
  | "quality_not_run"
  | "quality_regression";

export interface PortfolioLinkedRunReceipt {
  runId: string;
  caseId: string;
  terminal: boolean;
  economics: LinkedRunEconomics;
}

export interface PortfolioRunPair {
  caseId: string;
  baseline: PortfolioLinkedRunReceipt;
  candidate: PortfolioLinkedRunReceipt;
  /**
   * Must come from the existing evaluation/outcome layer. `null` means the
   * pair has not been quality-compared yet; this adapter never invents quality.
   */
  qualityEquivalent: boolean | null;
}

export interface PairedRunEvidence {
  evidenceType: "measured_before_after" | "unknown";
  qualityGate: "passed" | "failed" | "not_run";
  sampleSize: number;
  baselineTokens: number | null;
  candidateTokens: number | null;
  baselineCostUsd: number | null;
  candidateCostUsd: number | null;
  baselineRetries: number;
  candidateRetries: number;
  baselineFallbacks: number;
  candidateFallbacks: number;
  caseIds: string[];
  baselineRunIds: string[];
  candidateRunIds: string[];
  blockers: PairedRunEvidenceBlocker[];
  evidenceSource: string | null;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function economics(run: PortfolioLinkedRunReceipt) {
  return resolveExperimentEconomics({
    run: run.economics,
    submitted: { costUsd: null, tokens: null, retries: 0, fallbacks: 0 },
  });
}

/**
 * Convert linked Token Intelligence run receipts into paired optimizer evidence.
 * Caller-entered economics are never used. Every pair must be terminal, use
 * distinct run IDs, share one case ID and expose authoritative measured token
 * usage. Cost is retained only when complete for every run. Quality equivalence
 * must come from the existing evaluation layer rather than being inferred here.
 */
export function resolvePairedRunEvidence(pairs: readonly PortfolioRunPair[]): PairedRunEvidence {
  const blockers: PairedRunEvidenceBlocker[] = [];
  const caseIds = pairs.map((pair) => pair.caseId.trim());
  const baselineRunIds = pairs.map((pair) => pair.baseline.runId.trim());
  const candidateRunIds = pairs.map((pair) => pair.candidate.runId.trim());
  const allRunIds = [...baselineRunIds, ...candidateRunIds];

  if (unique(caseIds).length !== caseIds.length) blockers.push("duplicate_case_id");
  if (unique(allRunIds).length !== allRunIds.length) blockers.push("duplicate_run_id");

  let baselineTokens = 0;
  let candidateTokens = 0;
  let baselineCostUsd = 0;
  let candidateCostUsd = 0;
  let baselineTokenComplete = pairs.length > 0;
  let candidateTokenComplete = pairs.length > 0;
  let baselineCostComplete = pairs.length > 0;
  let candidateCostComplete = pairs.length > 0;
  let baselineRetries = 0;
  let candidateRetries = 0;
  let baselineFallbacks = 0;
  let candidateFallbacks = 0;

  for (const pair of pairs) {
    const pairCaseId = pair.caseId.trim();
    if (pair.baseline.caseId.trim() !== pairCaseId || pair.candidate.caseId.trim() !== pairCaseId) {
      blockers.push("mismatched_case_id");
    }
    if (!pair.baseline.terminal || !pair.candidate.terminal) blockers.push("non_terminal_run");

    const baseline = economics(pair.baseline);
    const candidate = economics(pair.candidate);

    if (baseline.tokens === null) {
      baselineTokenComplete = false;
      blockers.push("baseline_usage_unverified");
    } else {
      baselineTokens += baseline.tokens;
    }
    if (candidate.tokens === null) {
      candidateTokenComplete = false;
      blockers.push("candidate_usage_unverified");
    } else {
      candidateTokens += candidate.tokens;
    }

    if (baseline.costUsd === null) baselineCostComplete = false;
    else baselineCostUsd += baseline.costUsd;
    if (candidate.costUsd === null) candidateCostComplete = false;
    else candidateCostUsd += candidate.costUsd;

    baselineRetries += baseline.retries;
    candidateRetries += candidate.retries;
    baselineFallbacks += baseline.fallbacks;
    candidateFallbacks += candidate.fallbacks;
  }

  let qualityGate: PairedRunEvidence["qualityGate"];
  if (pairs.some((pair) => pair.qualityEquivalent === false)) {
    qualityGate = "failed";
    blockers.push("quality_regression");
  } else if (pairs.length === 0 || pairs.some((pair) => pair.qualityEquivalent === null)) {
    qualityGate = "not_run";
    blockers.push("quality_not_run");
  } else {
    qualityGate = "passed";
  }

  const structuralBlockers = blockers.filter((blocker) => !["quality_not_run", "quality_regression"].includes(blocker));
  const measured = pairs.length > 0
    && structuralBlockers.length === 0
    && baselineTokenComplete
    && candidateTokenComplete;

  const dedupedBlockers = unique(blockers);
  const sourceRunIds = [...baselineRunIds, ...candidateRunIds].filter(Boolean).sort();

  return {
    evidenceType: measured ? "measured_before_after" : "unknown",
    qualityGate,
    sampleSize: pairs.length,
    baselineTokens: baselineTokenComplete ? baselineTokens : null,
    candidateTokens: candidateTokenComplete ? candidateTokens : null,
    baselineCostUsd: baselineCostComplete ? baselineCostUsd : null,
    candidateCostUsd: candidateCostComplete ? candidateCostUsd : null,
    baselineRetries,
    candidateRetries,
    baselineFallbacks,
    candidateFallbacks,
    caseIds,
    baselineRunIds,
    candidateRunIds,
    blockers: dedupedBlockers,
    evidenceSource: measured ? `linked_runs:${sourceRunIds.join(",")}` : null,
  };
}

export function optimizerPlanFromRunPairs(args: {
  id: string;
  components: OptimizerPlanComponent[];
  pairs: readonly PortfolioRunPair[];
}): OptimizerPlanCandidate {
  const evidence = resolvePairedRunEvidence(args.pairs);
  return {
    id: args.id,
    components: args.components,
    evidenceType: evidence.evidenceType,
    qualityGate: evidence.qualityGate,
    sampleSize: evidence.sampleSize,
    baselineSessionTokens: evidence.baselineTokens,
    candidateSessionTokens: evidence.candidateTokens,
    baselineCostUsd: evidence.baselineCostUsd,
    candidateCostUsd: evidence.candidateCostUsd,
    evidenceSource: evidence.evidenceSource,
  };
}

export function routingEconomicsFromRunPairs(args: {
  id: string;
  policyVersion?: string | null;
  pairs: readonly PortfolioRunPair[];
  routeProvenanceGate: RoutingEconomicsCandidate["routeProvenanceGate"];
  baselineRoute?: string | null;
  resolvedRoutes?: string[];
  requiredExactRoute?: boolean;
  silentSubstitutionObserved?: boolean;
}): RoutingEconomicsCandidate {
  const evidence = resolvePairedRunEvidence(args.pairs);
  return {
    id: args.id,
    policyVersion: args.policyVersion,
    evidenceType: evidence.evidenceType,
    qualityGate: evidence.qualityGate,
    routeProvenanceGate: args.routeProvenanceGate,
    sampleSize: evidence.sampleSize,
    baselineCostUsd: evidence.baselineCostUsd,
    candidateCostUsd: evidence.candidateCostUsd,
    baselineTokens: evidence.baselineTokens,
    candidateTokens: evidence.candidateTokens,
    baselineRoute: args.baselineRoute,
    resolvedRoutes: args.resolvedRoutes,
    requiredExactRoute: args.requiredExactRoute,
    silentSubstitutionObserved: args.silentSubstitutionObserved,
    evidenceSource: evidence.evidenceSource,
  };
}
