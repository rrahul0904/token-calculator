import { createHash, createHmac } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function gatewayRequestDigest(input: unknown): string {
  return digest(JSON.stringify(canonicalize(input)));
}

export function gatewayIdempotencyIdentity(organizationId: string, apiKeyId: string, idempotencyKey: string, apiKeySecretHash: string) {
  const scopedKeyDigest = createHmac("sha256", apiKeySecretHash)
    .update(`gateway-idempotency\0${organizationId}\0${apiKeyId}\0${idempotencyKey}`)
    .digest("hex");
  return { runId: `run_${scopedKeyDigest.slice(0, 40)}`, keyDigest: scopedKeyDigest };
}
