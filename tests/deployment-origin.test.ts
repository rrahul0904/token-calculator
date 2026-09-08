import { afterEach, describe, expect, it } from "vitest";
import { runtimeApplicationOrigin, runtimeMcpResourceUri } from "@/lib/auth/deployment-origin";

const keys = ["VERCEL_ENV", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL", "APP_BASE_URL", "MCP_RESOURCE_URI"] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("security-sensitive deployment origin", () => {
  it("uses the exact generated Vercel Preview host over a stable configured origin", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "token-intelligence-release-abc.vercel.app";
    process.env.APP_BASE_URL = "https://token-intelligence-eight.vercel.app";
    process.env.MCP_RESOURCE_URI = "https://token-intelligence-eight.vercel.app/mcp";

    expect(runtimeApplicationOrigin()).toBe("https://token-intelligence-release-abc.vercel.app");
    expect(runtimeMcpResourceUri()).toBe("https://token-intelligence-release-abc.vercel.app/mcp");
  });

  it("keeps an explicit Production MCP resource authoritative", () => {
    process.env.VERCEL_ENV = "production";
    process.env.APP_BASE_URL = "https://token-intelligence-eight.vercel.app";
    process.env.MCP_RESOURCE_URI = "https://token-intelligence-eight.vercel.app/mcp";

    expect(runtimeApplicationOrigin()).toBe("https://token-intelligence-eight.vercel.app");
    expect(runtimeMcpResourceUri()).toBe("https://token-intelligence-eight.vercel.app/mcp");
  });
});
