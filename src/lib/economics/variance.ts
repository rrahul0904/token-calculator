import type { WorkloadEstimate } from "@/lib/economics/workload";

export type ActualCostSource = "reconciled" | "provider_measured" | "agent_measured" | "estimated" | "unknown";

export interface ActualRunEconomics {
  costUsd: number | null;
  costSource: ActualCostSource;
  freshInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  outputTokens: number;
  retryCount: number;
  fallbackCount: number;
  turnCount: number;
}

export interface VarianceDriver {
  key: "fresh_input_tokens" | "cache_read_tokens" | "cache_write_tokens" | "reasoning_tokens" | "output_tokens" | "retries" | "fallbacks" | "turns";
  label: string;
  planned: number;
  actual: number;
  delta: number;
  unit: "tokens" | "count";
}

export interface RunVariance {
  plannedCostUsd: number | null;
  actualCostUsd: number | null;
  costSource: ActualCostSource;
  totalCostDeltaUsd: number | null;
  totalCostDeltaPercent: number | null;
  drivers: VarianceDriver[];
  monetaryAttribution: "unattributed";
  unattributedCostDeltaUsd: number | null;
  warning: string;
}

function driver(key: VarianceDriver["key"], label: string, planned: number, actual: number, unit: VarianceDriver["unit"]): VarianceDriver {
  return { key, label, planned, actual, delta: actual - planned, unit };
}

export function explainRunVariance(plan: WorkloadEstimate, actual: ActualRunEconomics): RunVariance {
  const plannedCostUsd = plan.cost.totalUsd;
  const totalCostDeltaUsd = plannedCostUsd === null || actual.costUsd === null ? null : actual.costUsd - plannedCostUsd;
  const totalCostDeltaPercent = totalCostDeltaUsd === null || plannedCostUsd === null || plannedCostUsd === 0
    ? null
    : totalCostDeltaUsd / plannedCostUsd * 100;
  const plannedCacheWrites = plan.buckets.cacheWrite5mTokens + plan.buckets.cacheWrite1hTokens;
  const drivers = [
    driver("fresh_input_tokens", "Fresh input", plan.buckets.freshInputTokens, actual.freshInputTokens, "tokens"),
    driver("cache_read_tokens", "Cache reads", plan.buckets.cachedReadTokens, actual.cacheReadTokens, "tokens"),
    driver("cache_write_tokens", "Cache writes", plannedCacheWrites, actual.cacheWriteTokens, "tokens"),
    driver("reasoning_tokens", "Reasoning", 0, actual.reasoningTokens, "tokens"),
    driver("output_tokens", "Output", plan.buckets.outputTokens, actual.outputTokens, "tokens"),
    driver("retries", "Retries", 0, actual.retryCount, "count"),
    driver("fallbacks", "Fallbacks", 0, actual.fallbackCount, "count"),
    driver("turns", "Turns", 0, actual.turnCount, "count"),
  ].sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
  return {
    plannedCostUsd,
    actualCostUsd: actual.costUsd,
    costSource: actual.costSource,
    totalCostDeltaUsd,
    totalCostDeltaPercent,
    drivers,
    monetaryAttribution: "unattributed",
    unattributedCostDeltaUsd: totalCostDeltaUsd,
    warning: "Token/count deltas are observed variance drivers. Dollar attribution is intentionally not fabricated without call-level pricing evidence.",
  };
}
