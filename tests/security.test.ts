import { afterEach, describe, expect, it } from "vitest";
import { generateApiKey, getApiKeyLookupPrefix, hashApiKey, verifyApiKey } from "@/lib/security/api-keys";
import { decryptSecret, encryptSecret, isVaultConfigured } from "@/lib/security/vault";
import { assertMetadataOnly, findContentRetentionViolations } from "@/lib/telemetry/privacy";

const ORIGINAL_KEY = process.env.TOKEN_INTELLIGENCE_ENCRYPTION_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.TOKEN_INTELLIGENCE_ENCRYPTION_KEY;
  else process.env.TOKEN_INTELLIGENCE_ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe("API key security", () => {
  it("generates environment-prefixed secrets and verifies only the original secret", () => {
    const key = generateApiKey("live");
    expect(key.secret.startsWith("ti_live_")).toBe(true);
    expect(key.prefix.startsWith("ti_live_")).toBe(true);
    expect(key.secret).not.toBe(key.hash);
    expect(verifyApiKey(key.secret, key.hash)).toBe(true);
    expect(verifyApiKey(`${key.secret}x`, key.hash)).toBe(false);
    expect(getApiKeyLookupPrefix(key.secret)).toBe(key.prefix);
  });

  it("uses unique salts for the same secret", () => {
    const first = hashApiKey("same-secret");
    const second = hashApiKey("same-secret");
    expect(first).not.toBe(second);
    expect(verifyApiKey("same-secret", first)).toBe(true);
    expect(verifyApiKey("same-secret", second)).toBe(true);
  });

  it("rejects malformed hashes and malformed key prefixes", () => {
    expect(verifyApiKey("anything", "not-a-hash")).toBe(false);
    expect(getApiKeyLookupPrefix("sk_live_not-ours")).toBeNull();
  });
});

describe("provider credential vault", () => {
  it("encrypts with AES-GCM and binds ciphertext to associated data", () => {
    process.env.TOKEN_INTELLIGENCE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    expect(isVaultConfigured()).toBe(true);
    const encrypted = encryptSecret("provider-secret", "org_1:openai");
    expect(encrypted).not.toContain("provider-secret");
    expect(decryptSecret(encrypted, "org_1:openai")).toBe("provider-secret");
    expect(() => decryptSecret(encrypted, "org_2:openai")).toThrow();
  });

  it("fails closed when encryption is not configured", () => {
    delete process.env.TOKEN_INTELLIGENCE_ENCRYPTION_KEY;
    expect(isVaultConfigured()).toBe(false);
    expect(() => encryptSecret("secret")).toThrow("ENCRYPTION_KEY_NOT_CONFIGURED");
  });
});

describe("metadata-only telemetry", () => {
  it("allows economic metadata", () => {
    expect(() => assertMetadataOnly({
      model: "gpt-5.6-sol",
      tokens: 1200,
      nested: { retryCount: 2, toolName: "shell" },
    })).not.toThrow();
  });

  it("rejects prompt, source, raw tool output, and credential fields recursively", () => {
    const violations = findContentRetentionViolations({
      nested: {
        Prompt: "private prompt",
        sourceCode: "const x = 1",
        children: [{ stdout: "secret output" }],
      },
    });
    expect(violations.map((item) => item.key)).toEqual(expect.arrayContaining(["Prompt", "stdout"]));
    expect(() => assertMetadataOnly({ secret: "abc" })).toThrow("CONTENT_RETENTION_DISABLED");
  });
});
