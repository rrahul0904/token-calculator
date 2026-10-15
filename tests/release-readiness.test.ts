import process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateReleaseReadiness, getConfigurationStatus } from "@/lib/config";

const keys = ["APP_BASE_URL", "WORKOS_API_KEY", "WORKOS_WEBHOOK_SECRET", "WORKOS_AUTHKIT_DOMAIN", "MCP_RESOURCE_URI", "GITHUB_APP_ID", "GITHUB_PRIVATE_KEY", "GITHUB_WEBHOOK_SECRET"] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("production release integration readiness", () => {
  it("fails closed when the WorkOS webhook or MCP OAuth resource configuration is absent", () => {
    delete process.env.WORKOS_API_KEY;
    delete process.env.WORKOS_WEBHOOK_SECRET;
    delete process.env.WORKOS_AUTHKIT_DOMAIN;
    delete process.env.MCP_RESOURCE_URI;

    const configuration = getConfigurationStatus();
    expect(configuration.workosWebhook).toBe("code_complete_configuration_blocked");
    expect(configuration.mcpOAuth).toBe("code_complete_configuration_blocked");
  });

  it("recognizes provider-managed WorkOS webhook verification when an endpoint origin is derivable", () => {
    process.env.APP_BASE_URL = "https://app.example.test";
    process.env.WORKOS_API_KEY = "configured-api-key";
    delete process.env.WORKOS_WEBHOOK_SECRET;

    const configuration = getConfigurationStatus();
    expect(configuration.workosWebhook).toBe("live");
  });

  it("reports WorkOS webhook and MCP OAuth live only when their complete server configuration is present", () => {
    process.env.WORKOS_API_KEY = "configured-api-key";
    process.env.WORKOS_WEBHOOK_SECRET = "configured-webhook-secret";
    process.env.WORKOS_AUTHKIT_DOMAIN = "https://auth.example.test";
    process.env.MCP_RESOURCE_URI = "https://app.example.test/mcp";

    const configuration = getConfigurationStatus();
    expect(configuration.workosWebhook).toBe("live");
    expect(configuration.mcpOAuth).toBe("live");
  });

  it("keeps the optional GitHub integration non-live until independently certified", () => {
    for (const key of ["GITHUB_APP_ID", "GITHUB_PRIVATE_KEY", "GITHUB_WEBHOOK_SECRET"]) delete process.env[key];
    expect(getConfigurationStatus().github).toBe("not_enabled");

    process.env.GITHUB_APP_ID = "app-id";
    expect(getConfigurationStatus().github).toBe("code_complete_configuration_blocked");

    process.env.GITHUB_PRIVATE_KEY = "private-key";
    process.env.GITHUB_WEBHOOK_SECRET = "webhook-secret";
    expect(getConfigurationStatus().github).toBe("configured");
    expect(getConfigurationStatus().github).not.toBe("live");
  });

  it("requires verified database identity and excludes optional GitHub from release readiness", () => {
    const shared = {
      database: "ok" as const,
      auth: "live" as const,
      workosWebhook: "live" as const,
      mcpOAuth: "live" as const,
      stripe: "live" as const,
      credentialVault: "live" as const,
      retention: "live" as const,
    };

    const unchecked = evaluateReleaseReadiness({ ...shared, databaseIdentity: "unchecked" });
    expect(unchecked.releaseReady).toBe(false);
    expect(unchecked.releaseChecks.database).toBe(false);

    const verified = evaluateReleaseReadiness({ ...shared, databaseIdentity: "verified" });
    expect(verified.releaseReady).toBe(true);
    expect(verified.releaseChecks).not.toHaveProperty("github");
  });
});
