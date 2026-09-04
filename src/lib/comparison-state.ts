export interface ComparisonWorkloadState {
  inputTokens: number;
  outputTokens: number;
  cachedPercent: number;
  requestsPerMonth: number;
}

export const DEFAULT_COMPARISON_STATE: ComparisonWorkloadState = {
  inputTokens: 100_000,
  outputTokens: 10_000,
  cachedPercent: 0,
  requestsPerMonth: 10_000,
};

function parseBounded(value: string | null | undefined, fallback: number, max: number) {
  if (value === null || value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(max, Math.round(parsed));
}

export function parseComparisonState(
  search: Record<string, string | string[] | undefined> | URLSearchParams,
  fallback = DEFAULT_COMPARISON_STATE,
): ComparisonWorkloadState {
  const get = (key: string) => search instanceof URLSearchParams
    ? search.get(key)
    : Array.isArray(search[key]) ? search[key]?.[0] : search[key];
  return {
    inputTokens: parseBounded(get("input"), fallback.inputTokens, 10_000_000),
    outputTokens: parseBounded(get("output"), fallback.outputTokens, 10_000_000),
    cachedPercent: parseBounded(get("cached"), fallback.cachedPercent, 100),
    requestsPerMonth: parseBounded(get("requests"), fallback.requestsPerMonth, 10_000_000_000),
  };
}

export function serializeComparisonState(state: ComparisonWorkloadState) {
  const params = new URLSearchParams();
  params.set("input", String(Math.max(0, Math.min(10_000_000, Math.round(state.inputTokens)))));
  params.set("output", String(Math.max(0, Math.min(10_000_000, Math.round(state.outputTokens)))));
  params.set("cached", String(Math.max(0, Math.min(100, Math.round(state.cachedPercent)))));
  params.set("requests", String(Math.max(0, Math.min(10_000_000_000, Math.round(state.requestsPerMonth)))));
  return params.toString();
}
