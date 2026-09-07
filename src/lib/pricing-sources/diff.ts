import type { NormalizedPricingModel, PricingFieldChange, PricingModelDiff } from "@/lib/pricing-sources/types";

const MATERIAL_FIELDS = new Set([
  "contextWindow",
  "maxOutput",
  "pricing.input",
  "pricing.cachedInput",
  "pricing.output",
  "pricing.cacheWrite5m",
  "pricing.cacheWrite1h",
  "activePricingVersionId",
  "pricingTier",
]);

function values(model: NormalizedPricingModel) {
  return {
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput,
    "pricing.input": model.pricing.input,
    "pricing.cachedInput": model.pricing.cachedInput,
    "pricing.output": model.pricing.output,
    "pricing.cacheWrite5m": model.pricing.cacheWrite5m,
    "pricing.cacheWrite1h": model.pricing.cacheWrite1h,
    activePricingVersionId: model.activePricingVersionId,
    pricingTier: model.pricingTier,
    sourceUrl: model.sourceUrl,
    verifiedAt: model.verifiedAt,
  } satisfies Record<string, string | number | null>;
}

export function diffPricingCatalog(current: NormalizedPricingModel[], candidate: NormalizedPricingModel[]): PricingModelDiff[] {
  const currentById = new Map(current.map((model) => [model.modelId, model]));
  const candidateById = new Map(candidate.map((model) => [model.modelId, model]));
  const ids = [...new Set([...currentById.keys(), ...candidateById.keys()])].sort();
  const result: PricingModelDiff[] = [];

  for (const id of ids) {
    const before = currentById.get(id);
    const after = candidateById.get(id);
    if (!before && after) {
      result.push({ modelId: id, kind: "added", changes: [{ field: "model", previous: null, next: id, material: true }] });
      continue;
    }
    if (before && !after) {
      result.push({ modelId: id, kind: "removed", changes: [{ field: "model", previous: id, next: null, material: true }] });
      continue;
    }
    if (!before || !after) continue;
    const beforeValues = values(before);
    const afterValues = values(after);
    const changes: PricingFieldChange[] = [];
    for (const field of Object.keys(beforeValues) as Array<keyof typeof beforeValues>) {
      const previous = beforeValues[field];
      const next = afterValues[field];
      if (previous !== next) changes.push({ field, previous, next, material: MATERIAL_FIELDS.has(field) });
    }
    if (changes.length > 0) result.push({ modelId: id, kind: "changed", changes });
  }

  return result;
}

export function hasMaterialPricingChanges(diffs: PricingModelDiff[]) {
  return diffs.some((diff) => diff.changes.some((change) => change.material));
}
