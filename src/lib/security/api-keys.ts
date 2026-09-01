import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 32;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export type ApiKeyEnvironment = "live" | "test";

export interface GeneratedApiKey {
  secret: string;
  prefix: string;
  lastFour: string;
  hash: string;
  environment: ApiKeyEnvironment;
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

export function hashApiKey(secret: string, salt = randomBytes(16)): string {
  const derived = scryptSync(secret, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${encode(salt)}$${encode(derived)}`;
}

export function verifyApiKey(secret: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltRaw, expectedRaw] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  try {
    const salt = Buffer.from(saltRaw, "base64url");
    const expected = Buffer.from(expectedRaw, "base64url");
    const actual = scryptSync(secret, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function generateApiKey(environment: ApiKeyEnvironment = "live"): GeneratedApiKey {
  const random = randomBytes(32).toString("base64url");
  const secret = `ti_${environment}_${random}`;
  const prefix = `ti_${environment}_${random.slice(0, 10)}`;
  return {
    secret,
    prefix,
    lastFour: random.slice(-4),
    hash: hashApiKey(secret),
    environment,
  };
}

export function getApiKeyLookupPrefix(secret: string): string | null {
  const match = /^ti_(live|test)_([A-Za-z0-9_-]{10,})$/.exec(secret);
  if (!match) return null;
  return `ti_${match[1]}_${match[2].slice(0, 10)}`;
}
