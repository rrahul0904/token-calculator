import { describe, expect, it } from "vitest";
import { resolveCliBaseUrl } from "../scripts/ti-network";

describe("CLI API origin policy", () => {
  it("uses the canonical production origin by default", () => {
    expect(resolveCliBaseUrl("https://token-intelligence-eight.vercel.app", false)).toBe("https://token-intelligence-eight.vercel.app");
  });

  it.each(["https://api.attacker.example", "http://127.0.0.1:3000"])("requires explicit approval for custom origin %s", (origin) => {
    expect(() => resolveCliBaseUrl(origin, false)).toThrow("CUSTOM_BASE_URL_REQUIRES_--allow-custom-origin");
  });

  it("allows explicit HTTPS custom origins but rejects invalid targets", () => {
    expect(resolveCliBaseUrl("https://self-hosted.example", true)).toBe("https://self-hosted.example");
    expect(() => resolveCliBaseUrl("http://attacker.example", true)).toThrow("TOKEN_INTELLIGENCE_BASE_URL_INVALID");
    expect(() => resolveCliBaseUrl("https://user:pass@example.com", true)).toThrow("TOKEN_INTELLIGENCE_BASE_URL_INVALID");
    expect(() => resolveCliBaseUrl("https://example.com/path", true)).toThrow("TOKEN_INTELLIGENCE_BASE_URL_INVALID");
  });

  it("allows explicitly selected local HTTP development", () => {
    expect(resolveCliBaseUrl("http://localhost:3000", true)).toBe("http://localhost:3000");
  });
});
