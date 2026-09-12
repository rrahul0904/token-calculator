import { afterEach, describe, expect, it } from "vitest";
import { getPublicSiteUrl } from "@/lib/site-url";

const keys = ["VERCEL_ENV", "VERCEL_PROJECT_PRODUCTION_URL", "NEXT_PUBLIC_APP_URL", "APP_BASE_URL"] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("public site URL", () => {
  it("uses the stable production host for Vercel previews even when a stale preview URL is configured", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "token-intelligence-eight.vercel.app";
    process.env.NEXT_PUBLIC_APP_URL = "https://token-intelligence-old-preview.vercel.app";
    expect(getPublicSiteUrl()).toBe("https://token-intelligence-eight.vercel.app");
  });

  it("honors an explicit canonical URL outside Vercel preview", () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://tokens.example.com/";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "token-intelligence-eight.vercel.app";
    expect(getPublicSiteUrl()).toBe("https://tokens.example.com");
  });
});
