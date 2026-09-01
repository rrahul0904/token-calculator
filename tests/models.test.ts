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

  it("labels tokenizer precision conservatively", () => {
    for (const model of MODEL_CATALOG) {
      if (model.provider === "OpenAI") expect(model.tokenizerAccuracy).toBe("reference");
      else expect(model.tokenizerAccuracy).toBe("estimate");
    }
  });
});
