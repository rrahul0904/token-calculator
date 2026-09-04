import { describe, expect, it } from "vitest";
import { diffPricingCatalog, hasMaterialPricingChanges } from "@/lib/pricing-sources/diff";
import { normalizeCatalog } from "@/lib/pricing-sources/normalize";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("pricing snapshot diff engine", () => {
  it("is deterministic for unchanged catalogs", () => {
    const snapshot = normalizeCatalog(undefined, new Date("2026-09-04T12:00:00Z"));
    expect(diffPricingCatalog(snapshot, clone(snapshot))).toEqual([]);
  });

  it("detects price increases, decreases, cache additions/removals, context and source-date changes", () => {
    const current = normalizeCatalog(undefined, new Date("2026-09-04T12:00:00Z"));
    const candidate = clone(current);
    const sol = candidate.find((model) => model.modelId === "gpt-5.6-sol")!;
    sol.pricing.input += 1;
    sol.pricing.output -= 1;
    sol.pricing.cachedInput = null;
    sol.contextWindow += 1;
    sol.verifiedAt = "2026-09-05";

    const claude = candidate.find((model) => model.modelId === "claude-sonnet-5")!;
    claude.pricing.cacheWrite1h = null;

    const gptPro = candidate.find((model) => model.modelId === "gpt-5.5-pro")!;
    gptPro.pricing.cachedInput = 0.3;

    const diffs = diffPricingCatalog(current, candidate);
    const solDiff = diffs.find((diff) => diff.modelId === sol.modelId)!;
    expect(solDiff.changes.map((change) => change.field)).toEqual(expect.arrayContaining([
      "pricing.input",
      "pricing.output",
      "pricing.cachedInput",
      "contextWindow",
      "verifiedAt",
    ]));
    expect(solDiff.changes.find((change) => change.field === "verifiedAt")?.material).toBe(false);
    expect(diffs.find((diff) => diff.modelId === "gpt-5.5-pro")?.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "pricing.cachedInput", previous: null, next: 0.3 }),
    ]));
    expect(hasMaterialPricingChanges(diffs)).toBe(true);
  });

  it("detects promotion expiration from effective pricing snapshots", () => {
    const lastPromoDay = normalizeCatalog(undefined, new Date("2026-12-31T12:00:00Z"));
    const firstStandardDay = normalizeCatalog(undefined, new Date("2027-01-01T00:00:00Z"));
    const diffs = diffPricingCatalog(lastPromoDay, firstStandardDay);
    const gemini = diffs.find((diff) => diff.modelId === "gemini-3.7-flash")!;
    expect(gemini.changes.map((change) => change.field)).toEqual(expect.arrayContaining([
      "pricing.input",
      "pricing.cachedInput",
      "pricing.output",
      "activePricingVersionId",
    ]));
    expect(hasMaterialPricingChanges([gemini])).toBe(true);
  });
});
