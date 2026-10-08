import { adaptPortfolioPairsToExperimentEvidence } from "./experiment-result-adapter";
import {
  optimizerPlanFromRunPairs,
  resolvePairedRunEvidence,
  storedRunPair,
  type StoredOutcomeReceiptInput,
  type StoredRunReceiptInput,
} from "./paired-run-evidence";
import {
  evaluateOptimizerPlan,
  type OptimizerPlanComponent,
} from "./optimizer-plan";

export interface ReceiptBackedOptimizerPairInput {
  caseId: string;
  baselineRun: StoredRunReceiptInput;
  candidateRun: StoredRunReceiptInput;
  baselineOutcome: StoredOutcomeReceiptInput | null;
  candidateOutcome: StoredOutcomeReceiptInput | null;
}

export interface ReceiptBackedOptimizerPlanInput {
  id: string;
  components: OptimizerPlanComponent[];
  pairs: ReceiptBackedOptimizerPairInput[];
  minimumSampleSize?: number;
  qualityNonInferiorityMargin?: number;
  minimumQualityScore?: string | number | null;
  maxCostRegressionPct?: string | number | null;
}

/**
 * Evaluate an optimizer combination exclusively from persisted run/outcome
 * receipts. Caller-provided token, cost, retry, fallback or quality values are
 * not part of this input contract, so verified savings remain anchored to the
 * canonical Token Intelligence evidence layer.
 */
export function analyzeReceiptBackedOptimizerPlan(input: ReceiptBackedOptimizerPlanInput) {
  const runPairs = input.pairs.map((pair) => storedRunPair({
    caseId: pair.caseId,
    baselineRun: pair.baselineRun,
    candidateRun: pair.candidateRun,
    baselineOutcome: pair.baselineOutcome,
    candidateOutcome: pair.candidateOutcome,
    qualityNonInferiorityMargin: input.qualityNonInferiorityMargin,
  }));

  const evidence = resolvePairedRunEvidence(runPairs);
  const plan = evaluateOptimizerPlan(
    optimizerPlanFromRunPairs({
      id: input.id,
      components: input.components,
      pairs: runPairs,
    }),
    { minimumSampleSize: input.minimumSampleSize },
  );

  const experimentEvidence = adaptPortfolioPairsToExperimentEvidence({
    pairs: input.pairs,
    experimentStatus: "completed",
    minimumQualityScore: input.minimumQualityScore ?? null,
    maxCostRegressionPct: input.maxCostRegressionPct ?? 0,
  });

  return {
    plan,
    evidence,
    experimentEvidence,
    trustBoundary: {
      receiptBacked: true,
      callerSuppliedEconomicsAccepted: false,
      callerSuppliedQualityAccepted: false,
      componentSavingsSummed: false,
    },
  };
}
