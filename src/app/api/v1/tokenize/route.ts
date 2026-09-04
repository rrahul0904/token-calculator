import { NextResponse } from "next/server";
import { MODEL_CATALOG } from "@/lib/models";
import { getTokenizerSpec } from "@/lib/tokenizers/registry";
import { tokenizeServerText } from "@/lib/tokenizers/server";

export const MAX_TOKENIZE_BYTES = 500_000;
const DEFAULT_MAX_PIECES = 100;
const MAX_PIECES = 500;

function countWords(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

function response(body: unknown, status = 200) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  result.headers.set("X-Content-Type-Options", "nosniff");
  return result;
}

function error(code: string, message: string, status: number, extras: Record<string, unknown> = {}) {
  return response({
    error: code,
    errorDetail: { code, message },
    ...extras,
  }, status);
}

export function tokenizePayloadWithinLimit(text: string) {
  return new TextEncoder().encode(text).length <= MAX_TOKENIZE_BYTES;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("invalid_json", "Request body must be valid JSON.", 400);
  }

  if (!body || typeof body !== "object") {
    return error("invalid_request", "Request body must be a JSON object.", 400);
  }

  const value = body as Record<string, unknown>;
  if (typeof value.text !== "string") {
    return error("text_required", "Field 'text' is required and must be a string.", 400);
  }

  const text = value.text;
  if (!tokenizePayloadWithinLimit(text)) {
    return error("text_too_large", "Text exceeds the maximum UTF-8 payload size.", 413, { maxBytes: MAX_TOKENIZE_BYTES });
  }

  if (value.model !== undefined && typeof value.model !== "string") {
    return error("invalid_model", "Field 'model' must be a model ID string when provided.", 400);
  }
  if (value.includePieces !== undefined && typeof value.includePieces !== "boolean") {
    return error("invalid_include_pieces", "Field 'includePieces' must be boolean when provided.", 400);
  }
  if (value.maxPieces !== undefined && (typeof value.maxPieces !== "number" || !Number.isInteger(value.maxPieces) || value.maxPieces < 1 || value.maxPieces > MAX_PIECES)) {
    return error("invalid_max_pieces", "Field 'maxPieces' must be an integer from 1 to 500.", 400, { maxPieces: MAX_PIECES });
  }

  const model = typeof value.model === "string"
    ? MODEL_CATALOG.find((candidate) => candidate.id === value.model)
    : undefined;
  if (typeof value.model === "string" && !model) {
    return error("unsupported_model", "The requested model ID is not present in the Token Intelligence catalog.", 400, { model: value.model });
  }

  const family = model?.tokenizer ?? "openai-o200k";
  const includePieces = value.includePieces === true;
  const maxPieces = includePieces ? Number(value.maxPieces ?? DEFAULT_MAX_PIECES) : 0;
  const tokenized = tokenizeServerText(text, family, maxPieces);
  const spec = getTokenizerSpec(family);

  const payload: Record<string, unknown> = {
    tokens: tokenized.count,
    characters: Array.from(text).length,
    charactersWithoutSpaces: Array.from(text.replace(/\s/gu, "")).length,
    words: countWords(text),
    encoding: spec.displayName,
    tokenizer: {
      family: tokenized.family,
      precision: tokenized.precision,
      source: tokenized.source,
      caveat: tokenized.caveat,
    },
  };

  if (model) payload.model = { id: model.id, name: model.name, provider: model.provider };
  if (includePieces) {
    payload.pieces = tokenized.pieces;
    payload.piecesTruncated = tokenized.piecesTruncated;
    payload.piecesAvailable = tokenized.pieces.length > 0 || tokenized.count === 0;
  }

  return response(payload);
}
