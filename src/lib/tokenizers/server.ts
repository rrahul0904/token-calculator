import { Tiktoken } from "js-tiktoken/lite";
import o200kBase from "js-tiktoken/ranks/o200k_base";
import { estimateTokensForFamily, getTokenizerSpec } from "@/lib/tokenizers/registry";
import type { TokenizerFamily, TokenizerResult } from "@/types/tokenizer";

const encoding = new Tiktoken(o200kBase);

export function tokenizeServerText(text: string, family: TokenizerFamily, maxPieces = 0): TokenizerResult {
  const spec = getTokenizerSpec(family);

  if (family === "openai-o200k") {
    const ids = encoding.encode(text);
    const safeMax = Math.max(0, Math.min(Math.floor(maxPieces), 500));
    const pieces = safeMax > 0
      ? ids.slice(0, safeMax).map((id) => ({ id, text: encoding.decode([id]) }))
      : [];
    return {
      count: ids.length,
      pieces,
      family,
      precision: spec.precision,
      source: spec.source,
      caveat: spec.caveat,
      piecesTruncated: safeMax > 0 && ids.length > safeMax,
    };
  }

  return {
    count: estimateTokensForFamily(text, family),
    pieces: [],
    family,
    precision: spec.precision,
    source: spec.source,
    caveat: spec.caveat,
    piecesTruncated: false,
  };
}
