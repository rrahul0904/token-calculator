import * as z from "zod";

export const SHARE_STATE_VERSION = 1 as const;

const shareStateSchema = z.object({
  v: z.literal(SHARE_STATE_VERSION),
  modelId: z.string().min(1).max(200).optional(),
  inputTokens: z.number().int().nonnegative().max(100_000_000).optional(),
  outputTokens: z.number().int().nonnegative().max(10_000_000).optional(),
  cachedInputTokens: z.number().int().nonnegative().max(100_000_000).optional(),
  requestsPerMonth: z.number().int().nonnegative().max(100_000_000).optional(),
  allowedProviders: z.array(z.string().min(1).max(100)).max(20).optional(),
  allowedModels: z.array(z.string().min(1).max(200)).max(100).optional(),
  maxContextTokens: z.number().int().positive().max(10_000_000).optional(),
  maxOutputTokens: z.number().int().positive().max(10_000_000).optional(),
});

export type ShareState = z.infer<typeof shareStateSchema>;

const forbiddenKeys = /prompt|source|content|tooloutput|api.?key|secret|credential/i;

function assertNoSensitiveKeys(value: unknown, path = "root"): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenKeys.test(key)) throw new Error(`SENSITIVE_SHARE_STATE_KEY:${path}.${key}`);
    assertNoSensitiveKeys(child, `${path}.${key}`);
  }
}

function toBase64Url(input: string) {
  if (typeof Buffer !== "undefined") return Buffer.from(input, "utf8").toString("base64url");
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(input) || input.length > 8_192) throw new Error("INVALID_SHARE_STATE_ENCODING");
  if (typeof Buffer !== "undefined") return Buffer.from(input, "base64url").toString("utf8");
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShareState(input: Omit<ShareState, "v">): string {
  assertNoSensitiveKeys(input);
  const state = shareStateSchema.parse({ v: SHARE_STATE_VERSION, ...input });
  return toBase64Url(JSON.stringify(state));
}

export function decodeShareState(encoded: string): ShareState {
  const raw = JSON.parse(fromBase64Url(encoded)) as unknown;
  assertNoSensitiveKeys(raw);
  return shareStateSchema.parse(raw);
}

export function buildShareUrl(baseUrl: string, input: Omit<ShareState, "v">, parameter = "state") {
  const url = new URL(baseUrl);
  url.searchParams.set(parameter, encodeShareState(input));
  return url.toString();
}
