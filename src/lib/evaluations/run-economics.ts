export interface LinkedRunEconomics {
  reconciledCostUsd: string | number | null;
  usageSource: string | null;
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

function nonnegativeNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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

  const authoritativeUsage = ["provider_measured", "reconciled"].includes(args.run.usageSource ?? "");
  const costUsd = authoritativeUsage ? nonnegativeNumber(args.run.reconciledCostUsd) : null;
  // reasoningTokens is a detail/subset of provider output tokens in the
  // normalized gateway receipt. Adding it again would double-count usage.
  const tokenParts = [
    args.run.freshInputTokens,
    args.run.cacheReadTokens,
    args.run.cacheWriteTokens,
    args.run.outputTokens,
  ];
  const hasTokenEvidence = tokenParts.some((value) => value !== null && value !== undefined);
  const tokens = authoritativeUsage && hasTokenEvidence
    ? tokenParts.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;

  return {
    costUsd,
    tokens,
    retries: args.run.retryCount ?? 0,
    fallbacks: args.run.fallbackCount ?? 0,
    source: "linked_run" as const,
  };
}
