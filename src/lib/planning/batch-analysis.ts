import { Tiktoken } from "js-tiktoken/lite";
import o200kBase from "js-tiktoken/ranks/o200k_base";
import { calculateCost } from "@/lib/cost";
import { MODEL_CATALOG } from "@/lib/models";

export const BATCH_ALLOWED_EXTENSIONS = [".txt", ".md", ".json", ".csv", ".log"] as const;
export const BATCH_MAX_FILE_BYTES = 1_000_000;
export const BATCH_MAX_FILES = 50;

const encoding = new Tiktoken(o200kBase);
const encoder = new TextEncoder();

export interface BatchTextFile {
  name: string;
  text: string;
  sizeBytes?: number;
}

export interface BatchFileAnalysis {
  name: string;
  characters: number;
  words: number;
  referenceTokens: number;
  anthropicEstimatedTokens: number;
  geminiEstimatedTokens: number;
  deepseekEstimatedTokens: number;
  grokEstimatedTokens: number;
  modelId: string;
  contextWindow: number;
  contextUtilizationPct: number;
  fitsContext: boolean;
  estimatedRequestCostUsd: number | null;
  precision: "local_tokenizer_reference";
}

function extension(name: string) {
  const match = name.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function estimateByBytes(bytes: number, charsPerToken: number) {
  if (!bytes) return 0;
  return Math.max(1, Math.ceil(bytes / charsPerToken));
}

function words(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

export function validateBatchFile(file: BatchTextFile) {
  if (!BATCH_ALLOWED_EXTENSIONS.includes(extension(file.name) as (typeof BATCH_ALLOWED_EXTENSIONS)[number])) throw new Error(`UNSUPPORTED_BATCH_FILE:${file.name}`);
  const bytes = file.sizeBytes ?? encoder.encode(file.text).byteLength;
  if (bytes > BATCH_MAX_FILE_BYTES) throw new Error(`BATCH_FILE_TOO_LARGE:${file.name}`);
  if (file.text.includes("\u0000")) throw new Error(`BINARY_CONTENT_REJECTED:${file.name}`);
  return bytes;
}

export function analyzeBatchTextFiles(files: BatchTextFile[], options: { modelId: string; outputTokens?: number; cachedInputPct?: number }) {
  if (files.length > BATCH_MAX_FILES) throw new Error("TOO_MANY_BATCH_FILES");
  const model = MODEL_CATALOG.find((item) => item.id === options.modelId);
  if (!model) throw new Error("MODEL_NOT_FOUND");
  const outputTokens = Math.max(0, Math.floor(options.outputTokens ?? 0));
  const cachedInputPct = Math.min(100, Math.max(0, options.cachedInputPct ?? 0));

  const rows: BatchFileAnalysis[] = files.map((file) => {
    const bytes = validateBatchFile(file);
    const referenceTokens = encoding.encode(file.text).length;
    const cachedInputTokens = Math.round(referenceTokens * cachedInputPct / 100);
    const estimatedRequestCostUsd = calculateCost(model, { inputTokens: referenceTokens, cachedInputTokens, outputTokens }).total;
    return {
      name: file.name,
      characters: Array.from(file.text).length,
      words: words(file.text),
      referenceTokens,
      anthropicEstimatedTokens: estimateByBytes(bytes, 3.65),
      geminiEstimatedTokens: estimateByBytes(bytes, 4),
      deepseekEstimatedTokens: estimateByBytes(bytes, 3.8),
      grokEstimatedTokens: estimateByBytes(bytes, 4),
      modelId: model.id,
      contextWindow: model.contextWindow,
      contextUtilizationPct: model.contextWindow ? referenceTokens / model.contextWindow * 100 : 0,
      fitsContext: referenceTokens + outputTokens <= model.contextWindow,
      estimatedRequestCostUsd,
      precision: "local_tokenizer_reference",
    };
  });

  return {
    rows,
    totals: {
      files: rows.length,
      characters: rows.reduce((sum, row) => sum + row.characters, 0),
      words: rows.reduce((sum, row) => sum + row.words, 0),
      referenceTokens: rows.reduce((sum, row) => sum + row.referenceTokens, 0),
      estimatedRequestCostUsd: rows.reduce((sum, row) => sum + (row.estimatedRequestCostUsd ?? 0), 0),
    },
    privacy: { processedLocally: true, contentUploaded: false },
  };
}
