import { describe, expect, it } from "vitest";
import { MAX_TOKENIZE_BYTES, POST, tokenizePayloadWithinLimit } from "@/app/api/v1/tokenize/route";

async function post(body: unknown) {
  return POST(new Request("http://localhost/api/v1/tokenize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("/api/v1/tokenize", () => {
  it("preserves the legacy request and count response", async () => {
    const response = await post({ text: "hello world" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({
      characters: 11,
      charactersWithoutSpaces: 10,
      words: 2,
      encoding: "o200k_base",
    });
    expect(body.tokens).toBeGreaterThan(0);
    expect(body.tokenizer.precision).toBe("provider_reference");
  });

  it("selects the requested model tokenizer and labels estimates", async () => {
    const response = await post({ text: "hello world", model: "claude-sonnet-5" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.model.id).toBe("claude-sonnet-5");
    expect(body.tokenizer.family).toBe("anthropic-estimate");
    expect(body.tokenizer.precision).toBe("estimated");
  });

  it("caps optional token pieces", async () => {
    const response = await post({ text: "one two three four five", includePieces: true, maxPieces: 2 });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pieces.length).toBeLessThanOrEqual(2);
    expect(typeof body.piecesTruncated).toBe("boolean");
  });

  it("returns stable errors for unsupported models and invalid piece limits", async () => {
    const unsupported = await post({ text: "hello", model: "does-not-exist" });
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toMatchObject({ error: "unsupported_model", errorDetail: { code: "unsupported_model" } });

    const badPieces = await post({ text: "hello", maxPieces: 501 });
    expect(badPieces.status).toBe(400);
    expect(await badPieces.json()).toMatchObject({ error: "invalid_max_pieces" });
  });

  it("enforces UTF-8 payload boundaries before tokenization", async () => {
    expect(tokenizePayloadWithinLimit("a".repeat(MAX_TOKENIZE_BYTES - 1))).toBe(true);
    expect(tokenizePayloadWithinLimit("a".repeat(MAX_TOKENIZE_BYTES))).toBe(true);
    expect(tokenizePayloadWithinLimit("a".repeat(MAX_TOKENIZE_BYTES + 1))).toBe(false);

    const oversized = await post({ text: "a".repeat(MAX_TOKENIZE_BYTES + 1) });
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toMatchObject({ error: "text_too_large", maxBytes: MAX_TOKENIZE_BYTES });
  });
});
