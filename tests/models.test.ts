import { describe, expect, it } from "vitest";
import { MODEL_CATALOG, PROVIDERS, modelsByProvider } from "@/lib/models";

describe("pricing catalog", () => {
  it("has at least one model for every supported provider", () => {
    for (const provider of PROVIDERS) expect(modelsByProvider(provider).length).toBeGreaterThan(0);
  });

  it("keeps auditable pricing metadata on every model", () => {
    for (const model of MODEL_CATALOG) {
      expect(model.pricing.input).toBeGreaterThan(0);
      expect(model.pricing.output).toBeGreaterThan(0);
      expect(model.sourceUrl.startsWith("https://")).toBe(true);
      expect(model.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("tracks current provider models and point-in-time official rates", () => {
    const sol = MODEL_CATALOG.find((model) => model.id === "gpt-5.6-sol");
    const gpt55Pro = MODEL_CATALOG.find((model) => model.id === "gpt-5.5-pro");
    const fable51 = MODEL_CATALOG.find((model) => model.id === "claude-fable-5.1");
    const gemini37 = MODEL_CATALOG.find((model) => model.id === "gemini-3.7-flash");

    expect(sol?.pricing).toMatchObject({ input: 4, cachedInput: 0.4, output: 20 });
    expect(gpt55Pro?.pricing).toMatchObject({ input: 30, output: 180 });
    expect(gpt55Pro?.pricing.cachedInput).toBeUndefined();
    expect(fable51?.pricing).toMatchObject({ input: 10, cachedInput: 0.25, output: 50 });
    expect(gemini37?.pricing).toMatchObject({ input: 0.75, cachedInput: 0.075, output: 3.75 });
    expect(gemini37?.pricingLabel).toContain("2026-12-31");
  });

  it("labels tokenizer precision conservatively", () => {
    for (const model of MODEL_CATALOG) {
      if (model.provider === "OpenAI") expect(model.tokenizerAccuracy).toBe("reference");
      else expect(model.tokenizerAccuracy).toBe("estimate");
    }
  });
});
