import { afterEach, describe, expect, it } from "vitest";
import { getConfigurationStatus, hasExplicitE2eAuthAdapter } from "@/lib/config";

const keys = [
  "APP_BASE_URL",
  "TOKEN_INTELLIGENCE_E2E_AUTH_ENABLED",
  "TOKEN_INTELLIGENCE_E2E_AUTH_SECRET",
  "TOKEN_INTELLIGENCE_E2E_USER_ID",
  "TOKEN_INTELLIGENCE_E2E_USER_EMAIL",
  "TOKEN_INTELLIGENCE_E2E_WORKOS_ORG_ID",
] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

function configureE2e(baseUrl: string) {
  process.env.APP_BASE_URL = baseUrl;
  process.env.TOKEN_INTELLIGENCE_E2E_AUTH_ENABLED = "1";
  process.env.TOKEN_INTELLIGENCE_E2E_AUTH_SECRET = "ci-only-secret";
  process.env.TOKEN_INTELLIGENCE_E2E_USER_ID = "user_e2e";
  process.env.TOKEN_INTELLIGENCE_E2E_USER_EMAIL = "e2e@example.invalid";
  process.env.TOKEN_INTELLIGENCE_E2E_WORKOS_ORG_ID = "org_e2e";
}

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("explicit E2E authentication boundary", () => {
  it("allows the test adapter only on loopback HTTP origins", () => {
    configureE2e("http://127.0.0.1:3000");
    expect(hasExplicitE2eAuthAdapter()).toBe(true);

    process.env.APP_BASE_URL = "http://localhost:3000";
    expect(hasExplicitE2eAuthAdapter()).toBe(true);
  });

  it("fails closed on preview or production-like origins even with the correct E2E secret configured", () => {
    configureE2e("https://token-intelligence.example.com");
    expect(hasExplicitE2eAuthAdapter()).toBe(false);
    expect(getConfigurationStatus().auth).not.toBe("live");
  });

  it("fails closed when the base URL is absent or malformed", () => {
    configureE2e("not-a-url");
    expect(hasExplicitE2eAuthAdapter()).toBe(false);
    delete process.env.APP_BASE_URL;
    expect(hasExplicitE2eAuthAdapter()).toBe(false);
  });
});
