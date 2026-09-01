import type { ModelCatalogEntry, ModelPricing } from "@/lib/models";

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
  pricingTier: string;
  effectivePricing: ModelPricing;
};

const PER_MILLION = 1_000_000;

function tokenCost(tokens: number, rate?: number) {
  if (rate === undefined || tokens <= 0) return 0;
  return (tokens / PER_MILLION) * rate;
}

export function pricingForInput(model: ModelCatalogEntry, inputTokens: number) {
  if (model.longContext && inputTokens > model.longContext.threshold) {
    return { pricing: model.longContext.pricing, tier: model.longContext.label };
  }
  return { pricing: model.pricing, tier: model.pricingLabel ?? "Standard" };
}

export function calculateCost(model: ModelCatalogEntry, inputs: CostInputs): CostBreakdown {
  const cachedInputTokens = Math.min(Math.max(inputs.cachedInputTokens ?? 0, 0), inputs.inputTokens);
  const uncachedInputTokens = Math.max(inputs.inputTokens - cachedInputTokens, 0);
  const { pricing, tier } = pricingForInput(model, inputs.inputTokens);
  const input = tokenCost(uncachedInputTokens, pricing.input);
  const cachedInput = tokenCost(cachedInputTokens, pricing.cachedInput ?? pricing.input);
  const cacheWrite5m = tokenCost(inputs.cacheWrite5mTokens ?? 0, pricing.cacheWrite5m);
  const cacheWrite1h = tokenCost(inputs.cacheWrite1hTokens ?? 0, pricing.cacheWrite1h);
  const output = tokenCost(inputs.outputTokens, pricing.output);
  const total = input + cachedInput + cacheWrite5m + cacheWrite1h + output;
  return { input, cachedInput, cacheWrite5m, cacheWrite1h, output, total, pricingTier: tier, effectivePricing: pricing };
}

export function contextUsage(inputTokens: number, outputTokens: number, contextWindow: number) {
  if (contextWindow <= 0) return 0;
  return Math.min(((inputTokens + outputTokens) / contextWindow) * 100, 999);
}

export function monthlyProjection(costPerRequest: number, requestsPerMonth: number) {
  return Math.max(costPerRequest, 0) * Math.max(requestsPerMonth, 0);
}
