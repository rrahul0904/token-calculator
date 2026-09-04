import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mcpResourceUri, mcpScopesForClaims, mcpWwwAuthenticateHeader, resetMcpOAuthJwksCacheForTests, verifyMcpOAuthJwt } from "@/lib/auth/mcp-oauth";

function encoded(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function token(privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"], claims: Record<string, unknown>) {
  const header = encoded({ alg: "RS256", kid: "test-key", typ: "JWT" });
  const payload = encoded(claims);
  const signingInput = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

describe("MCP OAuth resource verification", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.MCP_RESOURCE_URI;
    process.env.APP_BASE_URL = "http://127.0.0.1:3000";
    resetMcpOAuthJwksCacheForTests();
  });

  it("derives resource metadata URLs without embedding credentials", () => {
    process.env.APP_BASE_URL = "https://token.example.com";
    expect(mcpResourceUri()).toBe("https://token.example.com/mcp");
    expect(mcpWwwAuthenticateHeader()).toContain('resource_metadata="https://token.example.com/.well-known/oauth-protected-resource"');
  });

  it("combines OAuth scope and permission claims", () => {
    expect(mcpScopesForClaims({ scope: "openid mcp:tools", permissions: ["usage:read", "mcp:tools"] })).toEqual(["openid", "mcp:tools", "usage:read"]);
  });

  it("accepts a valid WorkOS-style resource token and rejects wrong audience/expiry", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: "test-key", alg: "RS256", use: "sig" }] }), { status: 200, headers: { "content-type": "application/json" } })));

    const issuer = "https://auth.example.com";
    const resource = "https://token.example.com/mcp";
    const now = Math.floor(Date.now() / 1000);
    const valid = token(privateKey, { iss: issuer, aud: resource, sub: "user_123", org_id: "org_123", scope: "mcp:tools", iat: now - 5, exp: now + 300 });
    expect(await verifyMcpOAuthJwt(valid, issuer, resource)).toMatchObject({ sub: "user_123", org_id: "org_123" });

    const wrongAudience = token(privateKey, { iss: issuer, aud: "https://other.example/mcp", sub: "user_123", org_id: "org_123", scope: "mcp:tools", iat: now - 5, exp: now + 300 });
    expect(await verifyMcpOAuthJwt(wrongAudience, issuer, resource)).toBeNull();

    const expired = token(privateKey, { iss: issuer, aud: resource, sub: "user_123", org_id: "org_123", scope: "mcp:tools", iat: now - 600, exp: now - 1 });
    expect(await verifyMcpOAuthJwt(expired, issuer, resource)).toBeNull();
  });

  it("rejects a token whose signature does not match the advertised JWKS", async () => {
    const trusted = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const attacker = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = trusted.publicKey.export({ format: "jwk" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: "test-key", alg: "RS256" }] }), { status: 200 })));
    const now = Math.floor(Date.now() / 1000);
    const forged = token(attacker.privateKey, { iss: "https://auth.example.com", aud: "https://token.example.com/mcp", sub: "user_123", org_id: "org_123", scope: "mcp:tools", exp: now + 300 });
    expect(await verifyMcpOAuthJwt(forged, "https://auth.example.com", "https://token.example.com/mcp")).toBeNull();
  });
});
