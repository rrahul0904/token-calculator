import { describe, expect, it } from "vitest";
import { estimateGenerationTime, estimateModelMemory, tokensToWords, wordsToTokens } from "@/lib/planning";

describe("planning utilities", () => {
  it("converts prose tokens to a planning range", () => {
    expect(tokensToWords(1_000, "prose")).toEqual({ min: 670, max: 770 });
  });
  it("converts words back to a token range", () => {
    const result = wordsToTokens(750, "prose");
    expect(result.min).toBeGreaterThan(900);
    expect(result.max).toBeLessThan(1_200);
  });
  it("estimates model weight memory plus overhead", () => {
    expect(estimateModelMemory(70, "fp16", 20)).toMatchObject({ weightsGb: 140, overheadGb: 28, totalGb: 168 });
  });
  it("separates time to first token from decode time", () => {
    expect(estimateGenerationTime(1_000, 100, 0.8)).toEqual({ decodeSeconds: 10, totalSeconds: 10.8 });
  });
});
