export interface NormalizedPricingModel {
  modelId: string;
  provider: string;
  contextWindow: number;
  maxOutput: number | null;
  pricing: {
    input: number;
    cachedInput: number | null;
    output: number;
    cacheWrite5m: number | null;
    cacheWrite1h: number | null;
  };
  activePricingVersionId: string | null;
  pricingTier: string;
  sourceUrl: string;
  verifiedAt: string;
}

export interface PricingFieldChange {
  field: string;
  previous: string | number | null;
  next: string | number | null;
  material: boolean;
}

export interface PricingModelDiff {
  modelId: string;
  kind: "added" | "removed" | "changed";
  changes: PricingFieldChange[];
}
