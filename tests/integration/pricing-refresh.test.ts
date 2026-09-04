import process from "node:process";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { latestPublishedPricingSnapshot, refreshOpenRouterPricing } from "@/lib/pricing/refresh";

const integrationEnabled = process.env.TOKEN_INTELLIGENCE_INTEGRATION_TESTS === "1";
const describeIntegration = integrationEnabled ? describe : describe.skip;

function catalog(count: number) {
  return {
    data: Array.from({ length: count }, (_, index) => ({
      id: "integration/vendor-model-" + index,
      name: "Integration Model " + index,
      context_length: 128000,
      top_provider: { max_completion_tokens: 16000 },
      pricing: {
        prompt: "0.000001",
        completion: "0.000002",
        input_cache_read: "0.0000001",
        input_cache_write: "0.00000125",
      },
    })),
  };
}

describeIntegration("pricing refresh release invariants", () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const sql = postgres(databaseUrl, { max: 1, ssl: process.env.DATABASE_SSL === "disable" ? false : "require" });

  afterAll(async () => {
    await closeDb();
    await sql`delete from pricing_snapshots where source = 'openrouter'`;
    await sql`delete from inference_endpoints where source = 'openrouter' and external_model_id like 'integration/%'`;
    await sql.end({ timeout: 3 });
  });

  it("publishes a complete snapshot and preserves it when the next refresh fails", async () => {
    const goodFetch: typeof fetch = async () => new Response(JSON.stringify(catalog(12)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const published = await refreshOpenRouterPricing({ apiKey: "integration-key", fetchImpl: goodFetch });
    expect(published.modelCount).toBe(12);
    const before = await latestPublishedPricingSnapshot();
    expect(before?.id).toBe(published.snapshotId);
    expect(before?.status).toBe("published");

    const badFetch: typeof fetch = async () => new Response(JSON.stringify(catalog(1)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    await expect(refreshOpenRouterPricing({ apiKey: "integration-key", fetchImpl: badFetch })).rejects.toThrow("OPENROUTER_SUSPICIOUSLY_SMALL_CATALOG");

    const after = await latestPublishedPricingSnapshot();
    expect(after?.id).toBe(published.snapshotId);
    expect(after?.status).toBe("published");
  });
});
