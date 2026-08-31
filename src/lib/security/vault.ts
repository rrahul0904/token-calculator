import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function getMasterKey(): Buffer {
  const raw = process.env.TOKEN_INTELLIGENCE_ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY_NOT_CONFIGURED");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY_INVALID_LENGTH");
  return key;
}

export function isVaultConfigured(): boolean {
  try {
    return getMasterKey().length === 32;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string, associatedData = "token-intelligence:provider-credential"): string {
  const key = getMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, associatedData = "token-intelligence:provider-credential"): string {
  const [version, ivRaw, tagRaw, ciphertextRaw] = payload.split(".");
  if (version !== VERSION || !ivRaw || !tagRaw || !ciphertextRaw) throw new Error("ENCRYPTED_SECRET_INVALID_FORMAT");
  const decipher = createDecipheriv(ALGORITHM, getMasterKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

export const credentialVault = {
  keyVersion: 1,
  encrypt: encryptSecret,
  decrypt: decryptSecret,
};
