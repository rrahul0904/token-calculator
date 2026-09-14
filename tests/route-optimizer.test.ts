import { describe, expect, it } from "vitest";
import { compareHistoricalRoutes, selectBestHistoricalRoute, type HistoricalRouteRun } from "@/lib/optimization/routes";

function run(routeId: string, model: string, costUsd: number, success = true, overrides: Partial<HistoricalRouteRun> = {}): HistoricalRouteRun {
  return { routeId, provider: routeId === "current" ? "openai" : "anthropic", model, workflow: "code-review", contextTokens: 20_000, cacheReadShare: 0.4, costUsd, latencyMs: 1200, retries: 0, fallbacks: 0, success, ...overrides };
}

describe("historical route optimizer", () => {
  it("recommends only cheaper non-inferior historical routes", () => {
    const runs = [
      ...Array.from({ length: 10 }, () => run("current", "large", 1.0, true)),
      ...Array.from({ length: 10 }, () => run("candidate", "small", 0.3, true)),
    ];
    const comparisons = compareHistoricalRoutes({ runs, currentRouteId: "current", workflow: "code-review" });
    expect(comparisons).toHaveLength(1);
    expect(comparisons[0].evidenceType).toBe("historically_observed");
    expect(comparisons[0].estimatedSavingsPct).toBeCloseTo(70);
    expect(selectBestHistoricalRoute(comparisons)?.candidateModel).toBe("small");
  });

  it("rejects candidates with materially worse outcomes", () => {
    const runs = [
      ...Array.from({ length: 10 }, () => run("current", "large", 1.0, true)),
      ...Array.from({ length: 10 }, (_, i) => run("candidate", "small", 0.2, i < 6)),
    ];
    expect(compareHistoricalRoutes({ runs, currentRouteId: "current", workflow: "code-review" })).toEqual([]);
  });

  it("requires enough evidence and known economics", () => {
    expect(compareHistoricalRoutes({ runs: [run("current", "large", 1), run("candidate", "small", 0.2)], currentRouteId: "current", workflow: "code-review" })).toEqual([]);
    const unknownCost = [...Array.from({ length: 6 }, () => run("current", "large", 1)), ...Array.from({ length: 6 }, () => run("candidate", "small", 0.2, true, { costUsd: null }))];
    expect(compareHistoricalRoutes({ runs: unknownCost, currentRouteId: "current", workflow: "code-review" })).toEqual([]);
  });
});
