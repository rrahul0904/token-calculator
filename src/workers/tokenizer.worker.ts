/// <reference lib="webworker" />

import { Tiktoken } from "js-tiktoken/lite";
import o200kBase from "js-tiktoken/ranks/o200k_base";
import { estimateTokensForFamily, getTokenizerSpec } from "@/lib/tokenizers/registry";
import type { TokenMetrics, TokenizerFamily, TokenizerResult, TokenizerWorkerRequest } from "@/types/tokenizer";

declare const self: DedicatedWorkerGlobalScope;
const encoding = new Tiktoken(o200kBase);
const PIECE_LIMIT = 300;

function wordCount(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

function estimatedResult(text: string, family: Exclude<TokenizerFamily, "openai-o200k">): TokenizerResult {
  const spec = getTokenizerSpec(family);
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

self.onmessage = (event: MessageEvent<TokenizerWorkerRequest>) => {
  const { text, requestId } = event.data;
  const tokenIds = encoding.encode(text);
  const spec = getTokenizerSpec("openai-o200k");
  const pieces = tokenIds.slice(0, PIECE_LIMIT).map((id) => ({ id, text: encoding.decode([id]) }));

  const results: TokenMetrics["results"] = {
    "openai-o200k": {
      count: tokenIds.length,
      pieces,
      family: "openai-o200k",
      precision: spec.precision,
      source: spec.source,
      caveat: spec.caveat,
      piecesTruncated: tokenIds.length > PIECE_LIMIT,
    },
    "anthropic-estimate": estimatedResult(text, "anthropic-estimate"),
    "gemini-estimate": estimatedResult(text, "gemini-estimate"),
    "deepseek-estimate": estimatedResult(text, "deepseek-estimate"),
    "grok-estimate": estimatedResult(text, "grok-estimate"),
  };

  const result: TokenMetrics = {
    requestId,
    characters: Array.from(text).length,
    charactersWithoutSpaces: Array.from(text.replace(/\s/gu, "")).length,
    words: wordCount(text),
    results,
  };

  self.postMessage(result);
};

export {};
