import type { ModelCatalogEntry, ModelPricing, PricingVersion } from "@/lib/models";

export interface ResolvedPricing {
  pricing: ModelPricing;
  version: PricingVersion | null;
  tier: string;
  sourceUrl: string;
  verifiedAt: string;
  reason: "effective_version" | "catalog_default" | "long_context";
}

function startOfDay(value: string) {
  return Date.parse(value + "T00:00:00.000Z");
}

function endOfDay(value: string) {
  return Date.parse(value + "T23:59:59.999Z");
}

function activeVersion(model: ModelCatalogEntry, at: Date): PricingVersion | null {
  if (!model.pricingVersions?.length) return null;
  const timestamp = at.getTime();
  return model.pricingVersions.find((version) => {
    const starts = startOfDay(version.effectiveFrom);
    const ends = version.effectiveTo ? endOfDay(version.effectiveTo) : Number.POSITIVE_INFINITY;
    return timestamp >= starts && timestamp <= ends;
  }) ?? null;
}

export function resolvePricing({
  model,
  inputTokens,
  at = new Date(),
}: {
  model: ModelCatalogEntry;
  inputTokens: number;
  at?: Date;
}): ResolvedPricing {
  const version = activeVersion(model, at);
  const basePricing = version?.pricing ?? model.pricing;
  const baseTier = version?.label ?? model.pricingLabel ?? "Standard";
  const sourceUrl = version?.sourceUrl ?? model.sourceUrl;
  const verifiedAt = version?.verifiedAt ?? model.verifiedAt;

  if (model.longContext && inputTokens > model.longContext.threshold) {
    const multiplier = {
      input: basePricing.input === model.pricing.input ? model.longContext.pricing.input : model.longContext.pricing.input * (basePricing.input / model.pricing.input),
      cachedInput: basePricing.cachedInput === undefined || model.longContext.pricing.cachedInput === undefined || model.pricing.cachedInput === undefined
        ? basePricing.cachedInput
        : model.longContext.pricing.cachedInput * (basePricing.cachedInput / model.pricing.cachedInput),
      output: basePricing.output === model.pricing.output ? model.longContext.pricing.output : model.longContext.pricing.output * (basePricing.output / model.pricing.output),
      cacheWrite5m: basePricing.cacheWrite5m,
      cacheWrite1h: basePricing.cacheWrite1h,
    } satisfies ModelPricing;

    return {
      pricing: multiplier,
      version,
      tier: model.longContext.label + (version?.label ? " · " + version.label : ""),
      sourceUrl,
      verifiedAt,
      reason: "long_context",
    };
  }

  return {
    pricing: basePricing,
    version,
    tier: baseTier,
    sourceUrl,
    verifiedAt,
    reason: version ? "effective_version" : "catalog_default",
  };
}
