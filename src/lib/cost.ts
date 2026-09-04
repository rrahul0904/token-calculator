import type { ModelCatalogEntry, ModelPricing } from "@/lib/models";
import { resolvePricing } from "@/lib/pricing";

export type CostInputs = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWrite5mTokens?: number;
  cacheWrite1hTokens?: number;
  at?: Date;
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
  pricingVersionId: string | null;
  pricingSourceUrl: string;
  pricingVerifiedAt: string;
};

const PER_MILLION = 1_000_000;

function tokenCost(tokens: number, rate?: number) {
  if (rate === undefined || tokens <= 0) return 0;
  return (tokens / PER_MILLION) * rate;
}

export function pricingForInput(model: ModelCatalogEntry, inputTokens: number, at = new Date()) {
  const resolved = resolvePricing({ model, inputTokens, at });
  return { pricing: resolved.pricing, tier: resolved.tier, resolved };
}

export function calculateCost(model: ModelCatalogEntry, inputs: CostInputs): CostBreakdown {
  const cachedInputTokens = Math.min(Math.max(inputs.cachedInputTokens ?? 0, 0), inputs.inputTokens);
  const uncachedInputTokens = Math.max(inputs.inputTokens - cachedInputTokens, 0);
  const { pricing, tier, resolved } = pricingForInput(model, inputs.inputTokens, inputs.at);
  const input = tokenCost(uncachedInputTokens, pricing.input);
  const cachedInput = pricing.cachedInput === undefined ? 0 : tokenCost(cachedInputTokens, pricing.cachedInput);
  const cacheWrite5m = tokenCost(inputs.cacheWrite5mTokens ?? 0, pricing.cacheWrite5m);
  const cacheWrite1h = tokenCost(inputs.cacheWrite1hTokens ?? 0, pricing.cacheWrite1h);
  const output = tokenCost(inputs.outputTokens, pricing.output);
  const total = input + cachedInput + cacheWrite5m + cacheWrite1h + output;
  return {
    input,
    cachedInput,
    cacheWrite5m,
    cacheWrite1h,
    output,
    total,
    pricingTier: tier,
    effectivePricing: pricing,
    pricingVersionId: resolved.version?.id ?? null,
    pricingSourceUrl: resolved.sourceUrl,
    pricingVerifiedAt: resolved.verifiedAt,
  };
}

export function contextUsage(inputTokens: number, outputTokens: number, contextWindow: number) {
  if (contextWindow <= 0) return 0;
  return Math.min(((inputTokens + outputTokens) / contextWindow) * 100, 999);
}

export function monthlyProjection(costPerRequest: number, requestsPerMonth: number) {
  return Math.max(costPerRequest, 0) * Math.max(requestsPerMonth, 0);
}
