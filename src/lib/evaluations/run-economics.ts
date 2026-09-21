export interface LinkedRunEconomics {
  reconciledCostUsd: string | number | null;
  actualCostUsd: string | number | null;
  usageSource: string | null;
  agentVendor: string | null;
  freshInputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
  outputTokens: number | null;
  retryCount: number | null;
  fallbackCount: number | null;
}

export interface SubmittedExperimentEconomics {
  costUsd: number | null;
  tokens: number | null;
  retries: number;
  fallbacks: number;
}

export interface OrchestrationCallEconomics {
  provider: string;
  costUsd: string | number | null;
  costSource: string;
  freshInputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
  outputTokens: number | null;
}

function nonnegativeNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function authoritativeUsageSource(value: string | null | undefined) {
  return ["provider_measured", "reconciled"].includes(value ?? "");
}

function reasoningTokensAreAdditive(provider: string | null | undefined) {
  const normalized = String(provider ?? "").trim().toLowerCase();
  return normalized === "gemini"
    || normalized === "google"
    || normalized === "google ai"
    || normalized === "google generative ai";
}

function measuredTokens(args: {
  provider: string | null | undefined;
  freshInputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
  outputTokens: number | null;
}) {
  const tokenParts = [
    args.freshInputTokens,
    args.cacheReadTokens,
    args.cacheWriteTokens,
    args.outputTokens,
  ];
  const hasTokenEvidence = tokenParts.some((value) => value !== null && value !== undefined)
    || (reasoningTokensAreAdditive(args.provider) && args.reasoningTokens !== null && args.reasoningTokens !== undefined);
  if (!hasTokenEvidence) return null;

  const base = tokenParts.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return reasoningTokensAreAdditive(args.provider)
    ? base + (args.reasoningTokens ?? 0)
    : base;
}

export function resolveExperimentEconomics(args: {
  run?: LinkedRunEconomics | null;
  submitted: SubmittedExperimentEconomics;
}) {
  if (!args.run) {
    return {
      ...args.submitted,
      source: "submitted" as const,
    };
  }

  const authoritativeUsage = authoritativeUsageSource(args.run.usageSource);
  const reconciled = nonnegativeNumber(args.run.reconciledCostUsd);
  const providerMeasured = nonnegativeNumber(args.run.actualCostUsd);
  const costUsd = authoritativeUsage
    ? reconciled ?? (args.run.usageSource === "provider_measured" ? providerMeasured : null)
    : null;
  const tokens = authoritativeUsage
    ? measuredTokens({
      provider: args.run.agentVendor,
      freshInputTokens: args.run.freshInputTokens,
      cacheReadTokens: args.run.cacheReadTokens,
      cacheWriteTokens: args.run.cacheWriteTokens,
      reasoningTokens: args.run.reasoningTokens,
      outputTokens: args.run.outputTokens,
    })
    : null;

  return {
    costUsd,
    tokens,
    retries: args.run.retryCount ?? 0,
    fallbacks: args.run.fallbackCount ?? 0,
    source: "linked_run" as const,
  };
}

export function resolveOrchestrationExperimentEconomics(args: {
  calls: readonly OrchestrationCallEconomics[];
  retries: number;
  fallbacks: number;
}) {
  let costUsd = 0;
  let tokens = 0;
  let costComplete = args.calls.length > 0;
  let tokenComplete = args.calls.length > 0;

  for (const call of args.calls) {
    const authoritative = authoritativeUsageSource(call.costSource);
    const cost = nonnegativeNumber(call.costUsd);
    if (!authoritative || cost === null) {
      costComplete = false;
    } else {
      costUsd += cost;
    }

    const callTokens = authoritative
      ? measuredTokens({
        provider: call.provider,
        freshInputTokens: call.freshInputTokens,
        cacheReadTokens: call.cacheReadTokens,
        cacheWriteTokens: call.cacheWriteTokens,
        reasoningTokens: call.reasoningTokens,
        outputTokens: call.outputTokens,
      })
      : null;
    if (callTokens === null) {
      tokenComplete = false;
    } else {
      tokens += callTokens;
    }
  }

  return {
    costUsd: costComplete ? costUsd : null,
    tokens: tokenComplete ? tokens : null,
    retries: args.retries,
    fallbacks: args.fallbacks,
    source: "orchestration_calls" as const,
  };
}
