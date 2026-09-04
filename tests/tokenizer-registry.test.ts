import { describe, expect, it } from "vitest";
import { estimateTokensForFamily, getTokenizerSpec, TOKENIZER_REGISTRY, tokenizerPrecisionLabel } from "@/lib/tokenizers/registry";

describe("tokenizer registry", () => {
  it("declares every supported family with explicit precision", () => {
    expect(Object.keys(TOKENIZER_REGISTRY)).toEqual(expect.arrayContaining([
      "openai-o200k",
      "anthropic-estimate",
      "gemini-estimate",
      "deepseek-estimate",
      "grok-estimate",
    ]));
    expect(getTokenizerSpec("openai-o200k").precision).toBe("provider_reference");
    expect(getTokenizerSpec("anthropic-estimate").precision).toBe("estimated");
    expect(tokenizerPrecisionLabel("provider_reference")).toBe("Provider reference");
  });

  it("keeps local estimates deterministic", () => {
    expect(estimateTokensForFamily("hello world", "anthropic-estimate")).toBe(
      estimateTokensForFamily("hello world", "anthropic-estimate"),
    );
    expect(estimateTokensForFamily("", "gemini-estimate")).toBe(0);
  });
});
