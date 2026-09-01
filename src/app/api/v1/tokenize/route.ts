import { NextResponse } from "next/server";
import { Tiktoken } from "js-tiktoken/lite";
import o200kBase from "js-tiktoken/ranks/o200k_base";

const encoding = new Tiktoken(o200kBase);
const MAX_BYTES = 500_000;

function countWords(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!body || typeof body !== "object" || !("text" in body) || typeof (body as { text?: unknown }).text !== "string") {
    return NextResponse.json({ error: "text_required" }, { status: 400 });
  }
  const text = (body as { text: string }).text;
  if (new TextEncoder().encode(text).length > MAX_BYTES) return NextResponse.json({ error: "text_too_large", maxBytes: MAX_BYTES }, { status: 413 });
  const response = NextResponse.json({ tokens: encoding.encode(text).length, characters: Array.from(text).length, charactersWithoutSpaces: Array.from(text.replace(/\s/gu, "")).length, words: countWords(text), encoding: "o200k_base" });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
