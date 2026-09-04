import { MODEL_CATALOG, type ModelCatalogEntry } from "@/lib/models";
import { resolvePricing } from "@/lib/pricing";
import type { NormalizedPricingModel } from "@/lib/pricing-sources/types";

function nullable(value: number | undefined) {
  return value === undefined ? null : value;
}

export function normalizePricingModel(model: ModelCatalogEntry, at = new Date()): NormalizedPricingModel {
  const resolved = resolvePricing({ model, inputTokens: 0, at });
  return {
    modelId: model.id,
    provider: model.provider,
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput,
    pricing: {
      input: resolved.pricing.input,
      cachedInput: nullable(resolved.pricing.cachedInput),
      output: resolved.pricing.output,
      cacheWrite5m: nullable(resolved.pricing.cacheWrite5m),
      cacheWrite1h: nullable(resolved.pricing.cacheWrite1h),
    },
    activePricingVersionId: resolved.version?.id ?? null,
    pricingTier: resolved.tier,
    sourceUrl: resolved.sourceUrl,
    verifiedAt: resolved.verifiedAt,
  };
}

export function normalizeCatalog(catalog: ModelCatalogEntry[] = MODEL_CATALOG, at = new Date()) {
  return catalog.map((model) => normalizePricingModel(model, at)).sort((a, b) => a.modelId.localeCompare(b.modelId));
}
