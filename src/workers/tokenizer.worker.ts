/// <reference lib="webworker" />

import { getEncoding } from "js-tiktoken";
import type { TokenMetrics, TokenizerWorkerRequest } from "@/types/tokenizer";

declare const self: DedicatedWorkerGlobalScope;

const encoding = getEncoding("o200k_base");
const textEncoder = new TextEncoder();

function estimateByBytes(text: string, charsPerToken: number) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(textEncoder.encode(text).length / charsPerToken));
}

function wordCount(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

self.onmessage = (event: MessageEvent<TokenizerWorkerRequest>) => {
  const { text, requestId } = event.data;
  const tokenIds = encoding.encode(text);
  const pieces = tokenIds.slice(0, 240).map((id) => ({
    id,
    text: encoding.decode([id]),
  }));

  const result: TokenMetrics = {
    requestId,
    characters: Array.from(text).length,
    words: wordCount(text),
    openaiExact: tokenIds.length,
    anthropicEstimate: estimateByBytes(text, 3.65),
    geminiEstimate: estimateByBytes(text, 4.0),
    deepseekEstimate: estimateByBytes(text, 3.8),
    grokEstimate: estimateByBytes(text, 4.0),
    pieces,
  };

  self.postMessage(result);
};

export {};
