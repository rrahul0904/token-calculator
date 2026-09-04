import process from "node:process";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { latestPublishedPricingSnapshot, refreshOpenRouterPricing } from "@/lib/pricing/refresh";
import { effectivePublishedPricing } from "@/lib/pricing/store";

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

    const effective = await effectivePublishedPricing("vendor-model-0");
    expect(effective.source).toBe("published_snapshot");
    expect(effective.snapshot?.id).toBe(published.snapshotId);
    expect(effective.data).toHaveLength(1);
  });

  it("applies active reviewed overrides, including explicit unknown values, and ignores expired overrides", async () => {
    const latest = await latestPublishedPricingSnapshot();
    expect(latest).toBeTruthy();
    const endpointId = "openrouter:integration/vendor-model-0";
    const activeId = "override_active_" + Date.now();
    await sql`insert into pricing_overrides (id, endpoint_id, values, reason, expires_at)
      values (${activeId}, ${endpointId}, ${sql.json({ input: null, output: 9.5 })}, 'integration reviewed override', now() + interval '1 hour')`;
    let effective = await effectivePublishedPricing("vendor-model-0");
    expect(effective.data[0].pricing.input).toBeNull();
    expect(effective.data[0].pricing.output).toBe(9.5);
    expect(effective.data[0].override?.id).toBe(activeId);

    await sql`update pricing_overrides set expires_at = now() - interval '1 second' where id = ${activeId}`;
    effective = await effectivePublishedPricing("vendor-model-0");
    expect(effective.data[0].pricing.input).toBe(1);
    expect(effective.data[0].pricing.output).toBe(2);
    expect(effective.data[0].override).toBeNull();
  });
});
