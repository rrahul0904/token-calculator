import { createHash } from "node:crypto";
import { MODEL_CATALOG, type ModelCatalogEntry } from "@/lib/models";

export interface PricingSnapshotRecord {
  id: string;
  pricingVersion: string;
  provider: string;
  model: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  sourceUrl: string;
  verifiedAt: Date;
  inputPerMillionUsd: number;
  cacheReadPerMillionUsd: number | null;
  cacheWritePerMillionUsd: number | null;
  outputPerMillionUsd: number;
  dimensions: Record<string, unknown>;
  longContextTiers: Array<Record<string, unknown>>;
  catalogHash: string;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function catalogEntryHash(entry: ModelCatalogEntry) {
  const immutableEconomics = {
    id: entry.id,
    provider: entry.provider,
    pricing: entry.pricing,
    longContext: entry.longContext ?? null,
    sourceUrl: entry.sourceUrl,
    verifiedAt: entry.verifiedAt,
  };
  return createHash("sha256").update(stableJson(immutableEconomics)).digest("hex");
}

export function pricingVersionForCatalog(entries: ModelCatalogEntry[] = MODEL_CATALOG) {
  const hash = createHash("sha256");
  for (const entry of [...entries].sort((a, b) => `${a.provider}:${a.id}`.localeCompare(`${b.provider}:${b.id}`))) hash.update(catalogEntryHash(entry));
  return `pricing_${hash.digest("hex").slice(0, 16)}`;
}

export function snapshotFromCatalogEntry(entry: ModelCatalogEntry, options: { pricingVersion?: string; effectiveFrom?: Date } = {}): PricingSnapshotRecord {
  const pricingVersion = options.pricingVersion ?? pricingVersionForCatalog();
  const catalogHash = catalogEntryHash(entry);
  return {
    id: `price_${catalogHash.slice(0, 24)}`,
    pricingVersion,
    provider: entry.provider,
    model: entry.id,
    effectiveFrom: options.effectiveFrom ?? new Date(`${entry.verifiedAt}T00:00:00.000Z`),
    effectiveTo: null,
    sourceUrl: entry.sourceUrl,
    verifiedAt: new Date(`${entry.verifiedAt}T00:00:00.000Z`),
    inputPerMillionUsd: entry.pricing.input,
    cacheReadPerMillionUsd: entry.pricing.cachedInput ?? null,
    cacheWritePerMillionUsd: entry.pricing.cacheWrite5m ?? null,
    outputPerMillionUsd: entry.pricing.output,
    dimensions: {
      cacheWrite1hPerMillionUsd: entry.pricing.cacheWrite1h ?? null,
      tokenizerAccuracy: entry.tokenizerAccuracy,
      pricingLabel: entry.pricingLabel ?? null,
      status: entry.status ?? "current",
    },
    longContextTiers: entry.longContext ? [{ threshold: entry.longContext.threshold, label: entry.longContext.label, pricing: entry.longContext.pricing }] : [],
    catalogHash,
  };
}

export function snapshotCurrentCatalog(entries: ModelCatalogEntry[] = MODEL_CATALOG, effectiveFrom?: Date) {
  const pricingVersion = pricingVersionForCatalog(entries);
  return entries.map((entry) => snapshotFromCatalogEntry(entry, { pricingVersion, effectiveFrom }));
}

export function assertHistoricalPriceReference(pricingVersion: string | null | undefined) {
  if (!pricingVersion) throw new Error("PRICING_VERSION_REQUIRED_FOR_HISTORICAL_RECEIPT");
  if (!/^pricing_[a-f0-9]{16}$/i.test(pricingVersion)) throw new Error("INVALID_PRICING_VERSION");
}
