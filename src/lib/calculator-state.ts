export type CalculatorInputMode = "text" | "words" | "tokens";
export type ContextState = "comfortable" | "tight" | "near_limit" | "overflow";

export interface ShareableCalculatorState {
  mode: CalculatorInputMode;
  words: number;
  tokens: number;
  outputPercent: number;
  cachedPercent: number;
  requestsPerMonth: number;
  modelId: string;
}

function nonNegative(value: string | null, fallback: number) {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function parseCalculatorState(search: string, fallback: ShareableCalculatorState): ShareableCalculatorState {
  const params = new URLSearchParams(search);
  const requestedMode = params.get("mode");
  const mode: CalculatorInputMode = requestedMode === "words" || requestedMode === "tokens" || requestedMode === "text"
    ? requestedMode
    : fallback.mode;
  return {
    mode,
    words: Math.round(nonNegative(params.get("words"), fallback.words)),
    tokens: Math.round(nonNegative(params.get("tokens"), fallback.tokens)),
    outputPercent: clamp(nonNegative(params.get("outputPct"), fallback.outputPercent), 0, 150),
    cachedPercent: clamp(nonNegative(params.get("cached"), fallback.cachedPercent), 0, 100),
    requestsPerMonth: Math.round(nonNegative(params.get("requests"), fallback.requestsPerMonth)),
    modelId: params.get("model")?.trim() || fallback.modelId,
  };
}

export function serializeCalculatorState(
  state: ShareableCalculatorState,
  options: { textModeTokenCount?: number } = {},
): string {
  const params = new URLSearchParams();
  const safeMode = state.mode === "text" ? "tokens" : state.mode;
  params.set("mode", safeMode);
  if (safeMode === "words") params.set("words", String(Math.max(0, Math.round(state.words))));
  if (safeMode === "tokens") params.set("tokens", String(Math.max(0, Math.round(state.mode === "text" ? options.textModeTokenCount ?? 0 : state.tokens))));
  params.set("outputPct", String(clamp(state.outputPercent, 0, 150)));
  params.set("cached", String(clamp(state.cachedPercent, 0, 100)));
  params.set("requests", String(Math.max(0, Math.round(state.requestsPerMonth))));
  if (state.modelId) params.set("model", state.modelId);
  return params.toString();
}

export function contextHeadroom(inputTokens: number, reservedOutputTokens: number, contextWindow: number) {
  const input = Math.max(0, inputTokens);
  const reservedOutput = Math.max(0, reservedOutputTokens);
  const window = Math.max(0, contextWindow);
  const used = input + reservedOutput;
  const remaining = window - used;
  const utilization = window > 0 ? (used / window) * 100 : 0;
  const state: ContextState = utilization >= 100
    ? "overflow"
    : utilization >= 90
      ? "near_limit"
      : utilization >= 70
        ? "tight"
        : "comfortable";
  return { inputTokens: input, reservedOutputTokens: reservedOutput, contextWindow: window, used, remaining, utilization, state };
}
