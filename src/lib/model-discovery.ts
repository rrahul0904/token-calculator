import { MODEL_CATALOG, type ModelCatalogEntry, type ProviderName } from "@/lib/models";
import { resolvePricing } from "@/lib/pricing";
import { getTokenizerSpec } from "@/lib/tokenizers/registry";

const PROVIDER_ORDER: Record<ProviderName, number> = {
  OpenAI: 0,
  Anthropic: 1,
  Google: 2,
  xAI: 3,
  DeepSeek: 4,
};

export const CURATED_COMPARISONS = [
  ["gpt-5.6-sol", "claude-sonnet-5"],
  ["gpt-5.6-luna", "gemini-3.7-flash"],
  ["claude-sonnet-5", "gemini-3.7-flash"],
  ["gpt-5.6-terra", "gpt-5.6-luna"],
  ["gemini-3.7-flash", "gemini-3.5-flash"],
  ["grok-4.6", "deepseek-v4-flash-peak"],
] as const;

export type PricingHistoryStatus = "current" | "past" | "future_scheduled" | "catalog_current";

export interface PricingHistoryEntry {
  id: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  pricing: ModelCatalogEntry["pricing"];
  sourceUrl: string;
  verifiedAt: string;
  label: string;
  serviceTier: string | null;
  status: PricingHistoryStatus;
}

export function getModel(id: string): ModelCatalogEntry | null {
  return MODEL_CATALOG.find((model) => model.id === id) ?? null;
}

export function getCurrentModels(): ModelCatalogEntry[] {
  return MODEL_CATALOG.filter((model) => model.status !== "legacy");
}

export function getRelatedModels(model: ModelCatalogEntry, limit = 4): ModelCatalogEntry[] {
  const sameProvider = getCurrentModels()
    .filter((candidate) => candidate.id !== model.id && candidate.provider === model.provider)
    .sort((a, b) => Math.abs(a.contextWindow - model.contextWindow) - Math.abs(b.contextWindow - model.contextWindow));
  const otherProviders = getCurrentModels()
    .filter((candidate) => candidate.id !== model.id && candidate.provider !== model.provider)
    .sort((a, b) => Math.abs(a.pricing.input - model.pricing.input) - Math.abs(b.pricing.input - model.pricing.input));
  return [...sameProvider, ...otherProviders].slice(0, limit);
}

export function getComparableModels(model: ModelCatalogEntry, limit = 5): ModelCatalogEntry[] {
  const curated = CURATED_COMPARISONS
    .filter(([left, right]) => left === model.id || right === model.id)
    .map(([left, right]) => getModel(left === model.id ? right : left))
    .filter((candidate): candidate is ModelCatalogEntry => Boolean(candidate));
  const seen = new Set(curated.map((candidate) => candidate.id));
  for (const candidate of getRelatedModels(model, limit * 2)) {
    if (!seen.has(candidate.id)) {
      curated.push(candidate);
      seen.add(candidate.id);
    }
    if (curated.length >= limit) break;
  }
  return curated.slice(0, limit);
}

function comparisonSortKey(model: ModelCatalogEntry) {
  return [PROVIDER_ORDER[model.provider], model.id] as const;
}

export function getCanonicalComparison(leftId: string, rightId: string) {
  const left = getModel(leftId);
  const right = getModel(rightId);
  if (!left || !right || left.id === right.id) return null;
  const leftKey = comparisonSortKey(left);
  const rightKey = comparisonSortKey(right);
  const ordered = leftKey[0] < rightKey[0] || (leftKey[0] === rightKey[0] && leftKey[1] <= rightKey[1])
    ? [left, right] as const
    : [right, left] as const;
  return {
    left: ordered[0],
    right: ordered[1],
    path: `/compare/${ordered[0].id}/vs/${ordered[1].id}`,
    isCanonicalRequest: left.id === ordered[0].id && right.id === ordered[1].id,
  };
}

function utcToday(at: Date) {
  return at.toISOString().slice(0, 10);
}

function nextUtcDay(value: string) {
  const date = new Date(value + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function statusForWindow(from: string | null, to: string | null, at: Date): PricingHistoryStatus {
  const today = utcToday(at);
  if (from && from > today) return "future_scheduled";
  if (to && to < today) return "past";
  if (from || to) return "current";
  return "catalog_current";
}

export function getModelPricingHistory(model: ModelCatalogEntry, at = new Date()): PricingHistoryEntry[] {
  const versions: PricingHistoryEntry[] = (model.pricingVersions ?? []).map((version) => ({
    id: version.id,
    effectiveFrom: version.effectiveFrom,
    effectiveTo: version.effectiveTo ?? null,
    pricing: version.pricing,
    sourceUrl: version.sourceUrl,
    verifiedAt: version.verifiedAt,
    label: version.label ?? "Published pricing version",
    serviceTier: version.serviceTier ?? null,
    status: statusForWindow(version.effectiveFrom, version.effectiveTo ?? null, at),
  }));

  const defaultFrom = model.pricingEffectiveFrom
    ?? (versions.length > 0 && versions.every((version) => version.effectiveTo)
      ? nextUtcDay([...versions].sort((a, b) => String(a.effectiveTo).localeCompare(String(b.effectiveTo))).at(-1)!.effectiveTo!)
      : null);

  versions.push({
    id: `${model.id}-catalog-default`,
    effectiveFrom: defaultFrom,
    effectiveTo: null,
    pricing: model.pricing,
    sourceUrl: model.sourceUrl,
    verifiedAt: model.verifiedAt,
    label: model.pricingLabel ?? "Catalog pricing",
    serviceTier: null,
    status: statusForWindow(defaultFrom, null, at),
  });

  return versions.sort((a, b) => {
    if (a.effectiveFrom === null && b.effectiveFrom === null) return 0;
    if (a.effectiveFrom === null) return -1;
    if (b.effectiveFrom === null) return 1;
    return a.effectiveFrom.localeCompare(b.effectiveFrom);
  });
}

export function serializeModel(model: ModelCatalogEntry, at = new Date()) {
  const current = resolvePricing({ model, inputTokens: 0, at });
  const tokenizer = getTokenizerSpec(model.tokenizer);
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    status: model.status ?? "current",
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput,
    tokenizer: {
      family: model.tokenizer,
      precision: tokenizer.precision,
      displayName: tokenizer.displayName,
      caveat: tokenizer.caveat,
    },
    pricing: {
      current: current.pricing,
      tier: current.tier,
      versionId: current.version?.id ?? null,
      verifiedAt: current.verifiedAt,
      sourceUrl: current.sourceUrl,
    },
    longContext: model.longContext ?? null,
    pricingVersions: model.pricingVersions ?? [],
    note: model.note ?? null,
  };
}
