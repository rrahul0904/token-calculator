export type OrchestrationEconomicsRole = "planner" | "executor" | "reviewer";

export interface OrchestrationEconomicsCall {
  id: string;
  runId: string;
  costUsd: string | number | null;
  costSource: string;
  startedAt: Date;
  metadata: Record<string, unknown>;
}

export interface OrchestrationRoleEconomics {
  callCount: number;
  costUsd: number | null;
}

export interface OrchestrationRunEconomics {
  orchestrationRunId: string;
  taskCount: number;
  callCount: number;
  correctionCycles: number;
  experimentCount: number;
  planner: OrchestrationRoleEconomics;
  executor: OrchestrationRoleEconomics;
  reviewer: OrchestrationRoleEconomics;
  totalCostUsd: number | null;
  evidence: "reconciled" | "unavailable";
  latestAt: Date;
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nonnegativeCost(value: string | number | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function authoritativeCostSource(source: string) {
  return ["reconciled", "provider_measured"].includes(source.toLowerCase());
}

function roleFromMetadata(metadata: Record<string, unknown>): OrchestrationEconomicsRole | null {
  const role = metadataString(metadata, "orchestration.role");
  return role === "planner" || role === "executor" || role === "reviewer" ? role : null;
}

function correctionCycle(metadata: Record<string, unknown>) {
  const raw = metadataString(metadata, "orchestration.correction_cycle");
  if (raw === null) return 0;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

type MutableRole = { callCount: number; costUsd: number; complete: boolean };
type MutableRun = {
  orchestrationRunId: string;
  taskIds: Set<string>;
  experimentIds: Set<string>;
  callCount: number;
  correctionCycles: number;
  latestAt: Date;
  complete: boolean;
  planner: MutableRole;
  executor: MutableRole;
  reviewer: MutableRole;
};

function role(): MutableRole {
  return { callCount: 0, costUsd: 0, complete: true };
}

export function summarizeOrchestrationEconomics(calls: readonly OrchestrationEconomicsCall[]) {
  const grouped = new Map<string, MutableRun>();

  for (const call of calls) {
    const orchestrationRunId = metadataString(call.metadata, "orchestration.run_id");
    const callRole = roleFromMetadata(call.metadata);
    if (!orchestrationRunId || !callRole) continue;

    const group = grouped.get(orchestrationRunId) ?? {
      orchestrationRunId,
      taskIds: new Set<string>(),
      experimentIds: new Set<string>(),
      callCount: 0,
      correctionCycles: 0,
      latestAt: call.startedAt,
      complete: true,
      planner: role(),
      executor: role(),
      reviewer: role(),
    };

    group.callCount += 1;
    if (call.startedAt > group.latestAt) group.latestAt = call.startedAt;
    group.correctionCycles = Math.max(group.correctionCycles, correctionCycle(call.metadata));

    const taskId = metadataString(call.metadata, "orchestration.task_id");
    if (taskId) group.taskIds.add(taskId);
    const experimentId = metadataString(call.metadata, "orchestration.experiment_id");
    if (experimentId) group.experimentIds.add(experimentId);

    const bucket = group[callRole];
    bucket.callCount += 1;
    const cost = nonnegativeCost(call.costUsd);
    const authoritative = cost !== null && authoritativeCostSource(call.costSource);
    if (authoritative) {
      bucket.costUsd += cost;
    } else {
      bucket.complete = false;
      group.complete = false;
    }

    grouped.set(orchestrationRunId, group);
  }

  const runs: OrchestrationRunEconomics[] = [...grouped.values()].map((group) => {
    const roleView = (value: MutableRole): OrchestrationRoleEconomics => ({
      callCount: value.callCount,
      costUsd: value.callCount === 0 ? 0 : value.complete ? value.costUsd : null,
    });
    const totalCostUsd = group.complete
      ? group.planner.costUsd + group.executor.costUsd + group.reviewer.costUsd
      : null;
    return {
      orchestrationRunId: group.orchestrationRunId,
      taskCount: group.taskIds.size,
      callCount: group.callCount,
      correctionCycles: group.correctionCycles,
      experimentCount: group.experimentIds.size,
      planner: roleView(group.planner),
      executor: roleView(group.executor),
      reviewer: roleView(group.reviewer),
      totalCostUsd,
      evidence: group.complete ? "reconciled" as const : "unavailable" as const,
      latestAt: group.latestAt,
    };
  }).sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime());

  const reconciledRuns = runs.filter((run) => run.totalCostUsd !== null);
  const reconciledTotalCostUsd = reconciledRuns.reduce((sum, run) => sum + (run.totalCostUsd ?? 0), 0);
  const executorCostUsd = reconciledRuns.reduce((sum, run) => sum + (run.executor.costUsd ?? 0), 0);
  const premiumCostUsd = reconciledRuns.reduce(
    (sum, run) => sum + (run.planner.costUsd ?? 0) + (run.reviewer.costUsd ?? 0),
    0,
  );

  return {
    runs,
    runCount: runs.length,
    callCount: runs.reduce((sum, run) => sum + run.callCount, 0),
    taskCount: runs.reduce((sum, run) => sum + run.taskCount, 0),
    reconciledRunCount: reconciledRuns.length,
    reconciledTotalCostUsd: reconciledRuns.length ? reconciledTotalCostUsd : null,
    executorCostShare: reconciledTotalCostUsd > 0 ? executorCostUsd / reconciledTotalCostUsd : null,
    premiumCostShare: reconciledTotalCostUsd > 0 ? premiumCostUsd / reconciledTotalCostUsd : null,
  };
}
