import { describe, expect, it } from "vitest";
import { gatewayIdempotencyIdentity, gatewayRequestDigest } from "@/lib/gateway/idempotency";

describe("gateway durable idempotency identity", () => {
  it("derives stable identities scoped to both tenant and API key", () => {
    const identity = gatewayIdempotencyIdentity("org_a", "key_a", "request-123", "stored-scrypt-hash-a");
    expect(identity).toEqual(gatewayIdempotencyIdentity("org_a", "key_a", "request-123", "stored-scrypt-hash-a"));
    expect(identity.runId).toMatch(/^run_[a-f0-9]{40}$/);
    expect(identity).not.toEqual(gatewayIdempotencyIdentity("org_b", "key_a", "request-123", "stored-scrypt-hash-a"));
    expect(identity).not.toEqual(gatewayIdempotencyIdentity("org_a", "key_b", "request-123", "stored-scrypt-hash-b"));
  });

  it("hashes object-key order canonically while preserving array order", () => {
    expect(gatewayRequestDigest({ model: "m", input: { b: 2, a: 1 } })).toBe(gatewayRequestDigest({ input: { a: 1, b: 2 }, model: "m" }));
    expect(gatewayRequestDigest({ input: [1, 2] })).not.toBe(gatewayRequestDigest({ input: [2, 1] }));
  });
});
