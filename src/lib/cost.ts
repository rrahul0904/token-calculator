import type { ModelCatalogEntry } from "@/lib/models";

export type CostInputs = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWrite5mTokens?: number;
  cacheWrite1hTokens?: number;
};

export type CostBreakdown = {
  input: number;
  cachedInput: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  output: number;
  total: number;
};

const PER_MILLION = 1_000_000;

function tokenCost(tokens: number, rate?: number) {
  if (!rate || tokens <= 0) return 0;
  return (tokens / PER_MILLION) * rate;
}

export function calculateCost(model: ModelCatalogEntry, inputs: CostInputs): CostBreakdown {
  const cachedInputTokens = Math.min(Math.max(inputs.cachedInputTokens ?? 0, 0), inputs.inputTokens);
  const uncachedInputTokens = Math.max(inputs.inputTokens - cachedInputTokens, 0);

  const input = tokenCost(uncachedInputTokens, model.pricing.input);
  const cachedInput = tokenCost(cachedInputTokens, model.pricing.cachedInput ?? model.pricing.input);
  const cacheWrite5m = tokenCost(inputs.cacheWrite5mTokens ?? 0, model.pricing.cacheWrite5m);
  const cacheWrite1h = tokenCost(inputs.cacheWrite1hTokens ?? 0, model.pricing.cacheWrite1h);
  const output = tokenCost(inputs.outputTokens, model.pricing.output);
  const total = input + cachedInput + cacheWrite5m + cacheWrite1h + output;

  return { input, cachedInput, cacheWrite5m, cacheWrite1h, output, total };
}

export function contextUsage(inputTokens: number, outputTokens: number, contextWindow: number) {
  if (contextWindow <= 0) return 0;
  return Math.min(((inputTokens + outputTokens) / contextWindow) * 100, 999);
}

export function monthlyProjection(costPerRequest: number, requestsPerMonth: number) {
  return Math.max(costPerRequest, 0) * Math.max(requestsPerMonth, 0);
}
