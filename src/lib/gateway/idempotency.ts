import { createHash, scrypt } from "node:crypto";

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

export async function gatewayIdempotencyIdentity(organizationId: string, idempotencyKey: string, apiKeyScopeId: string): Promise<{ runId: string; keyDigest: string }> {
  const material = `gateway-idempotency\0${organizationId}\0${idempotencyKey}`;
  const scopedKeyDigest = await new Promise<Buffer>((resolve, reject) => {
    scrypt(material, apiKeyScopeId, 32, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
  const digest = scopedKeyDigest.toString("hex");
  return { runId: `run_${digest.slice(0, 40)}`, keyDigest: digest };
}
