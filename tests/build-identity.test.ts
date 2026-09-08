import process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/build/route";

const keys = ["NEXT_PUBLIC_TOKEN_INTELLIGENCE_BUILD_SHA", "NEXT_PUBLIC_TOKEN_INTELLIGENCE_BUILD_TIME", "VERCEL_GIT_COMMIT_SHA", "VERCEL_ENV", "VERCEL_DEPLOYMENT_ID"] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("build identity", () => {
  it("reports release identity without exposing server secrets", async () => {
    process.env.NEXT_PUBLIC_TOKEN_INTELLIGENCE_BUILD_SHA = "0123456789abcdef0123456789abcdef01234567";
    process.env.NEXT_PUBLIC_TOKEN_INTELLIGENCE_BUILD_TIME = "2026-09-08T03:00:00Z";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_release_test";
    const response = GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.gitSha).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(body.environment).toBe("preview");
    expect(body.deploymentId).toBe("dpl_release_test");
    expect(JSON.stringify(body)).not.toMatch(/DATABASE_URL|STRIPE_SECRET|WORKOS_API_KEY|ENCRYPTION_KEY/);
  });
});
