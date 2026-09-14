import { describe, expect, it } from "vitest";
import { wildcardCovers } from "../scripts/release/workos-configure";

describe("WorkOS release configuration", () => {
  it("recognizes the configured Vercel Preview wildcard without broadening domains", () => {
    const pattern = "https://token-intelligence-*-rrahul0904-5013s-projects.vercel.app/auth/callback";
    expect(wildcardCovers(
      pattern,
      "https://token-intelligence-abc123-rrahul0904-5013s-projects.vercel.app/auth/callback",
    )).toBe(true);
    expect(wildcardCovers(
      pattern,
      "https://attacker.example.com/auth/callback",
    )).toBe(false);
  });

  it("requires exact matches when no wildcard is registered", () => {
    const configured = "https://token-intelligence-eight.vercel.app/auth/callback";
    expect(wildcardCovers(configured, configured)).toBe(true);
    expect(wildcardCovers(configured, "https://other.vercel.app/auth/callback")).toBe(false);
  });
});
