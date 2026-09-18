export type CostEvidence = "reconciled" | "actual" | "estimated" | "unknown";

export interface OutcomeEconomicsInput {
  runId: string;
  repo: string | null;
  agentName: string;
  reconciledCostUsd: number | null;
  actualCostUsd: number | null;
  estimatedCostUsd: number | null;
  outcome: {
    taskCompleted: boolean | null;
    testsPassed: boolean | null;
    prNumber: number | null;
    ciPassed: boolean | null;
    merged: boolean | null;
    deploymentSuccessful: boolean | null;
    associationConfidence: number | null;
  } | null;
}

export interface OutcomeEconomicsAgentRow {
  agentName: string;
  attributedRuns: number;
  highConfidenceRuns: number;
  successfulRuns: number;
  knownCostUsd: number | null;
}

export interface OutcomeEconomicsSummary {
  attributedRuns: number;
  highConfidenceRuns: number;
  lowOrUnknownConfidenceRuns: number;
  knownCostRuns: number;
  estimatedOnlyRuns: number;
  unknownCostRuns: number;
  knownAttributedCostUsd: number | null;
  estimatedAttributedCostUsd: number | null;
  mergedPullRequests: number;
  deploymentLinkedRuns: number;
  ciPassedRuns: number;
  testsPassedRuns: number;
  taskCompletedRuns: number;
  knownCostPerMergedPrUsd: number | null;
  knownCostPerDeploymentLinkedRunUsd: number | null;
  agents: OutcomeEconomicsAgentRow[];
}

const HIGH_CONFIDENCE = 0.8;

function finiteNonNegative(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

export function selectRunCost(input: Pick<OutcomeEconomicsInput, "reconciledCostUsd" | "actualCostUsd" | "estimatedCostUsd">): {
  value: number | null;
  evidence: CostEvidence;
} {
  const reconciled = finiteNonNegative(input.reconciledCostUsd);
  if (reconciled !== null) return { value: reconciled, evidence: "reconciled" };
  const actual = finiteNonNegative(input.actualCostUsd);
  if (actual !== null) return { value: actual, evidence: "actual" };
  const estimated = finiteNonNegative(input.estimatedCostUsd);
  if (estimated !== null) return { value: estimated, evidence: "estimated" };
  return { value: null, evidence: "unknown" };
}

function isHighConfidence(row: OutcomeEconomicsInput) {
  const confidence = row.outcome?.associationConfidence;
  return confidence !== null && confidence !== undefined && confidence >= HIGH_CONFIDENCE;
}

function successfulOutcome(row: OutcomeEconomicsInput) {
  const outcome = row.outcome;
  return Boolean(outcome && (
    outcome.taskCompleted === true ||
    outcome.testsPassed === true ||
    outcome.ciPassed === true ||
    outcome.merged === true ||
    outcome.deploymentSuccessful === true
  ));
}

function sumOrNull(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

export function summarizeOutcomeEconomics(rows: readonly OutcomeEconomicsInput[]): OutcomeEconomicsSummary {
  const attributed = rows.filter((row) => row.outcome !== null);
  const highConfidence = attributed.filter(isHighConfidence);
  const costs = attributed.map((row) => ({ row, ...selectRunCost(row) }));
  const knownCosts = costs.filter((item) => item.evidence === "reconciled" || item.evidence === "actual");
  const estimatedCosts = costs.filter((item) => item.evidence === "estimated");

  const merged = highConfidence.filter((row) => row.outcome?.merged === true && row.outcome.prNumber !== null);
  const mergedKeys = new Set(merged.map((row) => `${row.repo ?? "unknown-repo"}#${row.outcome!.prNumber}`));
  const mergedKnownCosts = merged.flatMap((row) => {
    const cost = selectRunCost(row);
    return cost.value !== null && cost.evidence !== "estimated" ? [cost.value] : [];
  });

  const deploymentLinked = highConfidence.filter((row) => row.outcome?.deploymentSuccessful === true);
  const deploymentKnownCosts = deploymentLinked.flatMap((row) => {
    const cost = selectRunCost(row);
    return cost.value !== null && cost.evidence !== "estimated" ? [cost.value] : [];
  });

  const byAgent = new Map<string, OutcomeEconomicsInput[]>();
  for (const row of attributed) {
    const bucket = byAgent.get(row.agentName) ?? [];
    bucket.push(row);
    byAgent.set(row.agentName, bucket);
  }

  const agents = [...byAgent.entries()].map(([agentName, agentRows]) => {
    const known = agentRows.flatMap((row) => {
      const cost = selectRunCost(row);
      return cost.value !== null && cost.evidence !== "estimated" ? [cost.value] : [];
    });
    const high = agentRows.filter(isHighConfidence);
    return {
      agentName,
      attributedRuns: agentRows.length,
      highConfidenceRuns: high.length,
      successfulRuns: high.filter(successfulOutcome).length,
      knownCostUsd: sumOrNull(known),
    };
  }).sort((a, b) => b.attributedRuns - a.attributedRuns || a.agentName.localeCompare(b.agentName));

  const knownAttributedCostUsd = sumOrNull(knownCosts.flatMap((item) => item.value === null ? [] : [item.value]));
  const estimatedAttributedCostUsd = sumOrNull(estimatedCosts.flatMap((item) => item.value === null ? [] : [item.value]));

  return {
    attributedRuns: attributed.length,
    highConfidenceRuns: highConfidence.length,
    lowOrUnknownConfidenceRuns: attributed.length - highConfidence.length,
    knownCostRuns: knownCosts.length,
    estimatedOnlyRuns: estimatedCosts.length,
    unknownCostRuns: costs.filter((item) => item.evidence === "unknown").length,
    knownAttributedCostUsd,
    estimatedAttributedCostUsd,
    mergedPullRequests: mergedKeys.size,
    deploymentLinkedRuns: deploymentLinked.length,
    ciPassedRuns: highConfidence.filter((row) => row.outcome?.ciPassed === true).length,
    testsPassedRuns: highConfidence.filter((row) => row.outcome?.testsPassed === true).length,
    taskCompletedRuns: highConfidence.filter((row) => row.outcome?.taskCompleted === true).length,
    knownCostPerMergedPrUsd: mergedKeys.size && mergedKnownCosts.length
      ? mergedKnownCosts.reduce((sum, value) => sum + value, 0) / mergedKeys.size
      : null,
    knownCostPerDeploymentLinkedRunUsd: deploymentLinked.length && deploymentKnownCosts.length
      ? deploymentKnownCosts.reduce((sum, value) => sum + value, 0) / deploymentLinked.length
      : null,
    agents,
  };
}
