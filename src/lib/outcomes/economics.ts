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
    ciProvider: string | null;
    ciRunId: string | null;
    merged: boolean | null;
    deploymentSuccessful: boolean | null;
    deploymentProvider: string | null;
    deploymentId: string | null;
    deploymentEnvironment: string | null;
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
  identifiedDeployments: number;
  deploymentIdentityCoveragePct: number | null;
  ciPassedRuns: number;
  testsPassedRuns: number;
  taskCompletedRuns: number;
  knownCostPerMergedPrUsd: number | null;
  knownCostPerDeploymentLinkedRunUsd: number | null;
  knownCostPerDeploymentUsd: number | null;
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
  const mergedKnownCosts: number[] = [];
  const mergedKnownKeys = new Set<string>();
  for (const row of merged) {
    const cost = selectRunCost(row);
    if (cost.value !== null && cost.evidence !== "estimated") {
      mergedKnownCosts.push(cost.value);
      mergedKnownKeys.add(`${row.repo ?? "unknown-repo"}#${row.outcome!.prNumber}`);
    }
  }

  const deploymentLinked = highConfidence.filter((row) => row.outcome?.deploymentSuccessful === true);
  const deploymentKnownCosts = deploymentLinked.flatMap((row) => {
    const cost = selectRunCost(row);
    return cost.value !== null && cost.evidence !== "estimated" ? [cost.value] : [];
  });
  const identifiedDeploymentRows = deploymentLinked.filter((row) => Boolean(row.outcome?.deploymentId));
  const deploymentGroups = new Map<string, OutcomeEconomicsInput[]>();
  for (const row of identifiedDeploymentRows) {
    const key = `${row.outcome?.deploymentProvider ?? "unknown-provider"}:${row.outcome!.deploymentId}`;
    const bucket = deploymentGroups.get(key) ?? [];
    bucket.push(row);
    deploymentGroups.set(key, bucket);
  }
  const fullyKnownDeploymentTotals: number[] = [];
  for (const rowsForDeployment of deploymentGroups.values()) {
    const costsForDeployment = rowsForDeployment.map((row) => selectRunCost(row));
    if (costsForDeployment.every((cost) => cost.value !== null && cost.evidence !== "estimated")) {
      fullyKnownDeploymentTotals.push(costsForDeployment.reduce((sum, cost) => sum + (cost.value ?? 0), 0));
    }
  }

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
    identifiedDeployments: deploymentGroups.size,
    deploymentIdentityCoveragePct: deploymentLinked.length ? identifiedDeploymentRows.length / deploymentLinked.length : null,
    ciPassedRuns: highConfidence.filter((row) => row.outcome?.ciPassed === true).length,
    testsPassedRuns: highConfidence.filter((row) => row.outcome?.testsPassed === true).length,
    taskCompletedRuns: highConfidence.filter((row) => row.outcome?.taskCompleted === true).length,
    knownCostPerMergedPrUsd: mergedKnownKeys.size
      ? mergedKnownCosts.reduce((sum, value) => sum + value, 0) / mergedKnownKeys.size
      : null,
    knownCostPerDeploymentLinkedRunUsd: deploymentKnownCosts.length
      ? deploymentKnownCosts.reduce((sum, value) => sum + value, 0) / deploymentKnownCosts.length
      : null,
    knownCostPerDeploymentUsd: fullyKnownDeploymentTotals.length
      ? fullyKnownDeploymentTotals.reduce((sum, value) => sum + value, 0) / fullyKnownDeploymentTotals.length
      : null,
    agents,
  };
}
