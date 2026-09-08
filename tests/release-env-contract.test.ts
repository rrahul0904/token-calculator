import { describe, expect, it } from "vitest";
import { releaseEnvStatus } from "../scripts/release/env-contract";

describe("release environment contract", () => {
  it("fails production closed when launch-critical configuration is absent", () => {
    const status = releaseEnvStatus("production", {});
    expect(status.ready).toBe(false);
    expect(status.missing).toContain("DATABASE_URL");
    expect(status.missing).toContain("WORKOS_WEBHOOK_SECRET");
    expect(status.missing).toContain("MCP_RESOURCE_URI");
    expect(status.missing).toContain("STRIPE_WEBHOOK_SECRET");
    expect(status.missing).toContain("TOKEN_INTELLIGENCE_ENCRYPTION_KEY");
  });

  it("allows Preview callback derivation from the Vercel system URL", () => {
    const env: NodeJS.ProcessEnv = {
      APP_BASE_URL: "https://preview.example.test",
      DATABASE_URL: "postgres://configured",
      DATABASE_SSL: "require",
      WORKOS_API_KEY: "configured-api-key",
      WORKOS_CLIENT_ID: "configured-client-id",
      WORKOS_COOKIE_PASSWORD: "configured-cookie-password",
      WORKOS_WEBHOOK_SECRET: "configured-webhook-secret",
      WORKOS_AUTHKIT_DOMAIN: "https://auth.example.test",
      STRIPE_SECRET_KEY: "configured-stripe-key",
      STRIPE_WEBHOOK_SECRET: "configured-stripe-webhook",
      STRIPE_PRICE_PRO: "price_pro",
      STRIPE_PRICE_TEAM: "price_team",
      TOKEN_INTELLIGENCE_ENCRYPTION_KEY: "configured-encryption-key",
      CRON_SECRET: "configured-cron-secret",
      VERCEL_URL: "preview.example.test",
    };
    const status = releaseEnvStatus("preview", env);
    expect(status.ready).toBe(true);
    expect(status.variables.find((item) => item.name === "NEXT_PUBLIC_WORKOS_REDIRECT_URI")?.source).toBe("system-derived");
  });
});
