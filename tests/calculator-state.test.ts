import { describe, expect, it } from "vitest";
import { contextHeadroom, parseCalculatorState, serializeCalculatorState } from "@/lib/calculator-state";

const fallback = {
  mode: "text" as const,
  words: 500,
  tokens: 1000,
  outputPercent: 35,
  cachedPercent: 0,
  requestsPerMonth: 10_000,
  modelId: "gpt-5.6-sol",
};

describe("calculator share state", () => {
  it("serializes text mode as numeric token workload without prompt content", () => {
    const query = serializeCalculatorState(fallback, { textModeTokenCount: 12_345 });
    expect(query).toContain("mode=tokens");
    expect(query).toContain("tokens=12345");
    expect(query).not.toContain("text=");
    expect(query).not.toContain("prompt");
  });

  it("hydrates safe values and clamps malformed percentages", () => {
    const state = parseCalculatorState("?mode=tokens&tokens=12000&outputPct=999&cached=-20&requests=50000&model=gemini-3.7-flash", fallback);
    expect(state.mode).toBe("tokens");
    expect(state.tokens).toBe(12_000);
    expect(state.outputPercent).toBe(150);
    expect(state.cachedPercent).toBe(0);
    expect(state.requestsPerMonth).toBe(50_000);
    expect(state.modelId).toBe("gemini-3.7-flash");
  });

  it("falls back safely for invalid negative numeric values", () => {
    const state = parseCalculatorState("?tokens=-1&requests=not-a-number", fallback);
    expect(state.tokens).toBe(1000);
    expect(state.requestsPerMonth).toBe(10_000);
  });
});

describe("context headroom", () => {
  it("reports comfortable, tight, near-limit and overflow states", () => {
    expect(contextHeadroom(600, 50, 1000).state).toBe("comfortable");
    expect(contextHeadroom(700, 50, 1000).state).toBe("tight");
    expect(contextHeadroom(900, 50, 1000).state).toBe("near_limit");
    const overflow = contextHeadroom(950, 100, 1000);
    expect(overflow.state).toBe("overflow");
    expect(overflow.remaining).toBe(-50);
  });
});
