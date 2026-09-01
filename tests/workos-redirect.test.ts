import process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { configuredWorkosRedirectUri, hasConfiguredWorkosRedirectUri, workosRedirectUriForRequest } from "@/lib/auth/redirect-uri";

const keys = ["VERCEL_ENV", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL", "NEXT_PUBLIC_WORKOS_REDIRECT_URI"] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("WorkOS redirect URI resolution", () => {
  it("uses the exact Vercel deployment URL for previews", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "token-intelligence-preview.example.vercel.app";
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = "https://production.example.com/auth/callback";

    expect(configuredWorkosRedirectUri()).toBe("https://token-intelligence-preview.example.vercel.app/auth/callback");
    expect(hasConfiguredWorkosRedirectUri()).toBe(true);
  });

  it("prefers the canonical configured callback in production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "token-intelligence-eight.vercel.app";
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = "https://token.example.com/auth/callback";

    expect(configuredWorkosRedirectUri()).toBe("https://token.example.com/auth/callback");
  });

  it("falls back to Vercel's production URL when no canonical callback is configured", () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "token-intelligence-eight.vercel.app";
    delete process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;

    expect(configuredWorkosRedirectUri()).toBe("https://token-intelligence-eight.vercel.app/auth/callback");
  });

  it("uses the request origin outside Vercel when configuration is absent", () => {
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;

    expect(workosRedirectUriForRequest("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000/auth/callback");
    expect(hasConfiguredWorkosRedirectUri()).toBe(false);
  });
});
