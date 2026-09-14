import type { WorkloadEstimate, WorkloadScenario } from "@/lib/economics/workload";

export interface EconomicsAdvisory {
  authoritative: false;
  requiresOutcomeVerification: true;
  budget: {
    scopeType: "project" | "organization";
    scopeId: string | null;
    period: "month";
    suggestedLimitUsd: number | null;
    warnAtPct: 80;
    hardStop: false;
  };
  policy: {
    allowedModelIds: string[];
    preferredEndpointId: string | null;
    maximumPlannedRequestCostUsd: number | null;
    enforcement: "advisory_only";
  };
  gateway: {
    preferredModel: string;
    preferredEndpointId: string | null;
    autoRoute: false;
  };
}

export function advisoryFromEstimate(
  scenario: WorkloadScenario,
  estimate: WorkloadEstimate,
  scope: { projectId?: string | null } = {},
): EconomicsAdvisory {
  const monthly = estimate.monthlyCostUsd;
  const request = estimate.cost.totalUsd;
  return {
    authoritative: false,
    requiresOutcomeVerification: true,
    budget: {
      scopeType: scope.projectId ? "project" : "organization",
      scopeId: scope.projectId ?? null,
      period: "month",
      suggestedLimitUsd: monthly === null ? null : monthly * 1.1,
      warnAtPct: 80,
      hardStop: false,
    },
    policy: {
      allowedModelIds: [scenario.modelId],
      preferredEndpointId: scenario.endpointId ?? null,
      maximumPlannedRequestCostUsd: request === null ? null : request * 1.1,
      enforcement: "advisory_only",
    },
    gateway: {
      preferredModel: scenario.modelId,
      preferredEndpointId: scenario.endpointId ?? null,
      autoRoute: false,
    },
  };
}
