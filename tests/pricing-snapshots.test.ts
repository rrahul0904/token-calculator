import { describe, expect, it } from "vitest";
import { MODEL_CATALOG } from "@/lib/models";
import { assertHistoricalPriceReference, catalogEntryHash, pricingVersionForCatalog, snapshotCurrentCatalog, snapshotFromCatalogEntry } from "@/lib/pricing/snapshots";

describe("pricing snapshots", () => {
  it("creates deterministic catalog and entry versions", () => {
    const entry = MODEL_CATALOG[0];
    expect(catalogEntryHash(entry)).toHaveLength(64);
    const version = pricingVersionForCatalog([entry]);
    expect(version).toMatch(/^pricing_[a-f0-9]{16}$/);
    expect(pricingVersionForCatalog([entry])).toBe(version);
  });

  it("freezes source, verification and long-context economics", () => {
    const entry = MODEL_CATALOG.find((item) => item.longContext) ?? MODEL_CATALOG[0];
    const snapshot = snapshotFromCatalogEntry(entry, { pricingVersion: "pricing_0123456789abcdef", effectiveFrom: new Date("2026-09-01T00:00:00Z") });
    expect(snapshot.pricingVersion).toBe("pricing_0123456789abcdef");
    expect(snapshot.sourceUrl).toBe(entry.sourceUrl);
    expect(snapshot.inputPerMillionUsd).toBe(entry.pricing.input);
    expect(snapshot.longContextTiers.length).toBe(entry.longContext ? 1 : 0);
  });

  it("uses one version for an entire snapshot batch", () => {
    const snapshots = snapshotCurrentCatalog(MODEL_CATALOG.slice(0, 3), new Date("2026-09-01T00:00:00Z"));
    expect(new Set(snapshots.map((item) => item.pricingVersion)).size).toBe(1);
    expect(new Set(snapshots.map((item) => item.catalogHash)).size).toBe(snapshots.length);
  });

  it("requires explicit pricing version on historical receipts", () => {
    expect(() => assertHistoricalPriceReference(null)).toThrow(/PRICING_VERSION_REQUIRED/);
    expect(() => assertHistoricalPriceReference("today")).toThrow(/INVALID_PRICING_VERSION/);
    expect(() => assertHistoricalPriceReference("pricing_0123456789abcdef")).not.toThrow();
  });
});
