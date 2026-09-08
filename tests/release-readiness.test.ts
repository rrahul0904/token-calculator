import process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { getConfigurationStatus } from "@/lib/config";

const keys = ["WORKOS_API_KEY", "WORKOS_WEBHOOK_SECRET", "WORKOS_AUTHKIT_DOMAIN", "MCP_RESOURCE_URI"] as const;
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

  it("reports WorkOS webhook and MCP OAuth live only when their complete server configuration is present", () => {
    process.env.WORKOS_API_KEY = "sk_test_release_readiness";
    process.env.WORKOS_WEBHOOK_SECRET = "whsec_test_release_readiness";
    process.env.WORKOS_AUTHKIT_DOMAIN = "https://auth.example.test";
    process.env.MCP_RESOURCE_URI = "https://app.example.test/mcp";

    const configuration = getConfigurationStatus();
    expect(configuration.workosWebhook).toBe("live");
    expect(configuration.mcpOAuth).toBe("live");
  });
});
