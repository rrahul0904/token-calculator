import { describe, expect, it } from "vitest";
import { parseComparisonState, serializeComparisonState } from "@/lib/comparison-state";
import {
  getCanonicalComparison,
  getComparableModels,
  getCurrentModels,
  getModel,
  getModelPricingHistory,
  getRelatedModels,
  serializeModel,
} from "@/lib/model-discovery";

describe("model discovery", () => {
  it("looks up current models and related models without returning self", () => {
    const sol = getModel("gpt-5.6-sol")!;
    expect(sol.name).toBe("GPT-5.6 Sol");
    expect(getCurrentModels().some((model) => model.id === "gpt-5")).toBe(false);
    expect(getRelatedModels(sol).every((model) => model.id !== sol.id)).toBe(true);
    expect(getComparableModels(sol).every((model) => model.id !== sol.id)).toBe(true);
  });

  it("canonicalizes pair direction deterministically by provider/model order", () => {
    const canonical = getCanonicalComparison("gpt-5.6-sol", "claude-sonnet-5")!;
    expect(canonical.path).toBe("/compare/gpt-5.6-sol/vs/claude-sonnet-5");
    expect(canonical.isCanonicalRequest).toBe(true);

    const reverse = getCanonicalComparison("claude-sonnet-5", "gpt-5.6-sol")!;
    expect(reverse.path).toBe(canonical.path);
    expect(reverse.isCanonicalRequest).toBe(false);
    expect(getCanonicalComparison("gpt-5.6-sol", "gpt-5.6-sol")).toBeNull();
  });

  it("projects source-backed pricing history without fabricating unknown dates", () => {
    const gemini = getModel("gemini-3.7-flash")!;
    const currentHistory = getModelPricingHistory(gemini, new Date("2026-09-04T12:00:00Z"));
    expect(currentHistory).toHaveLength(2);
    expect(currentHistory.find((entry) => entry.id.includes("intro"))?.status).toBe("current");
    const defaultRate = currentHistory.find((entry) => entry.id.endsWith("catalog-default"))!;
    expect(defaultRate.effectiveFrom).toBe("2027-01-01");
    expect(defaultRate.status).toBe("future_scheduled");

    const futureHistory = getModelPricingHistory(gemini, new Date("2027-01-01T00:00:00Z"));
    expect(futureHistory.find((entry) => entry.id.includes("intro"))?.status).toBe("past");
    expect(futureHistory.find((entry) => entry.id.endsWith("catalog-default"))?.status).toBe("current");

    const claude = getModel("claude-sonnet-5")!;
    expect(getModelPricingHistory(claude, new Date("2026-09-04"))[0].effectiveFrom).toBeNull();
  });

  it("serializes tokenizer certainty and effective pricing provenance", () => {
    const model = serializeModel(getModel("claude-sonnet-5")!, new Date("2026-09-04T12:00:00Z"));
    expect(model.tokenizer.precision).toBe("estimated");
    expect(model.pricing.current).toMatchObject({ input: 2, cachedInput: 0.2, output: 10 });
    expect(model.pricing.sourceUrl).toMatch(/^https:/);
  });
});

describe("comparison workload URLs", () => {
  it("parses, clamps and round-trips numeric state only", () => {
    const parsed = parseComparisonState(new URLSearchParams("input=100000&output=10000&cached=999&requests=50000"));
    expect(parsed).toEqual({ inputTokens: 100000, outputTokens: 10000, cachedPercent: 100, requestsPerMonth: 50000 });
    const query = serializeComparisonState(parsed);
    expect(query).toBe("input=100000&output=10000&cached=100&requests=50000");
    expect(query).not.toMatch(/prompt|text|key|token=/i);
  });

  it("falls back safely for negative and malformed values", () => {
    const parsed = parseComparisonState(new URLSearchParams("input=-1&output=nope&cached=-20&requests=-8"));
    expect(parsed.inputTokens).toBeGreaterThanOrEqual(0);
    expect(parsed.outputTokens).toBeGreaterThanOrEqual(0);
    expect(parsed.cachedPercent).toBeGreaterThanOrEqual(0);
    expect(parsed.requestsPerMonth).toBeGreaterThanOrEqual(0);
  });
});
