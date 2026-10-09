import {
  evaluateExperimentRows,
  type ExperimentEvidenceRow,
} from "@/lib/evaluations/experiment-evidence";
import {
  resolveExperimentEconomics,
  type LinkedRunEconomics,
} from "@/lib/evaluations/run-economics";
import type { StoredOutcomeReceiptInput, StoredRunReceiptInput } from "./paired-run-evidence";

export interface PortfolioExperimentPairInput {
  caseId: string;
  baselineRun: StoredRunReceiptInput;
  candidateRun: StoredRunReceiptInput;
  baselineOutcome: StoredOutcomeReceiptInput | null;
  candidateOutcome: StoredOutcomeReceiptInput | null;
}

export interface PortfolioExperimentResultDraft extends ExperimentEvidenceRow {
  variant: "baseline" | "candidate";
  caseId: string;
  runId: string;
  tokens: number | null;
  retries: number;
  fallbacks: number;
  economicsSource: "linked_run";
}

export interface PortfolioExperimentAdapterResult {
  rows: PortfolioExperimentResultDraft[];
  eligibleForVerification: boolean;
  blockers: string[];
  verification: ReturnType<typeof evaluateExperimentRows> | null;
}

function linkedEconomics(run: StoredRunReceiptInput) {
  const linked: LinkedRunEconomics = {
    reconciledCostUsd: run.reconciledCostUsd,
    actualCostUsd: run.actualCostUsd,
    usageSource: run.usageSource,
    agentVendor: run.agentVendor,
    freshInputTokens: run.freshInputTokens,
    cacheReadTokens: run.cacheReadTokens,
    cacheWriteTokens: run.cacheWriteTokens,
    reasoningTokens: run.reasoningTokens,
    outputTokens: run.outputTokens,
    retryCount: run.retryCount,
    fallbackCount: run.fallbackCount,
  };
  return resolveExperimentEconomics({
    run: linked,
    submitted: { costUsd: null, tokens: null, retries: 0, fallbacks: 0 },
  });
}

function qualityScore(outcome: StoredOutcomeReceiptInput | null): number | null {
  if (!outcome || outcome.score === null || outcome.score === undefined) return null;
  const value = Number(outcome.score);
  return Number.isFinite(value) ? value : null;
}

function success(outcome: StoredOutcomeReceiptInput | null): boolean | null {
  if (!outcome) return null;
  const signals = [outcome.taskCompleted, outcome.testsPassed].filter((value): value is boolean => typeof value === "boolean");
  return signals.length ? signals.every(Boolean) : null;
}

function row(
  variant: "baseline" | "candidate",
  caseId: string,
  run: StoredRunReceiptInput,
  outcome: StoredOutcomeReceiptInput | null,
): PortfolioExperimentResultDraft {
  const economics = linkedEconomics(run);
  return {
    variant,
    caseId,
    runId: run.id,
    qualityScore: qualityScore(outcome),
    costUsd: economics.costUsd,
    tokens: economics.tokens,
    retries: economics.retries,
    fallbacks: economics.fallbacks,
    success: success(outcome),
    economicsSource: "linked_run",
  };
}

/**
 * Build rows compatible with the existing experiment/verified-savings evidence
 * gate. The adapter refuses verification unless every baseline/candidate row is
 * terminal and has authoritative measured tokens/cost plus stored quality and
 * success evidence. No portfolio-specific savings ledger is created here.
 */
export function adaptPortfolioPairsToExperimentEvidence(args: {
  pairs: readonly PortfolioExperimentPairInput[];
  experimentStatus?: string;
  minimumQualityScore?: string | number | null;
  maxCostRegressionPct?: string | number | null;
}): PortfolioExperimentAdapterResult {
  const blockers: string[] = [];
  const caseIds = args.pairs.map((pair) => pair.caseId.trim());
  if (new Set(caseIds).size !== caseIds.length) blockers.push("duplicate_case_id");

  const runIds = args.pairs.flatMap((pair) => [pair.baselineRun.id, pair.candidateRun.id]);
  if (new Set(runIds).size !== runIds.length) blockers.push("duplicate_run_id");

  const rows = args.pairs.flatMap((pair) => {
    if (pair.baselineRun.endedAt === null || pair.candidateRun.endedAt === null) blockers.push("non_terminal_run");
    return [
      row("baseline", pair.caseId, pair.baselineRun, pair.baselineOutcome),
      row("candidate", pair.caseId, pair.candidateRun, pair.candidateOutcome),
    ];
  });

  for (const result of rows) {
    if (result.tokens === null) blockers.push("authoritative_tokens_required");
    if (result.costUsd === null) blockers.push("authoritative_cost_required");
    if (result.qualityScore === null) blockers.push("quality_score_required");
    if (result.success === null) blockers.push("success_evidence_required");
  }

  const dedupedBlockers = [...new Set(blockers)];
  const eligibleForVerification = args.pairs.length > 0 && dedupedBlockers.length === 0;
  const verification = eligibleForVerification
    ? evaluateExperimentRows({
        status: args.experimentStatus ?? "completed",
        rows,
        minimumQualityScore: args.minimumQualityScore ?? null,
        maxCostRegressionPct: args.maxCostRegressionPct ?? 0,
      })
    : null;

  return {
    rows,
    eligibleForVerification,
    blockers: dedupedBlockers,
    verification,
  };
}
