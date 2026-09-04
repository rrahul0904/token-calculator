import { createHash, randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { inferenceEndpoints, pricingRates, pricingSnapshots } from "@/db/schema";
import { fetchOpenRouterCatalog, type OpenRouterNormalizedEndpoint } from "@/lib/pricing/openrouter";

function decimal(value: number | null) {
  return value === null ? null : value.toFixed(8);
}

export async function latestPublishedPricingSnapshot(source = "openrouter") {
  if (!isDatabaseConfigured()) return null;
  return (await getDb().select().from(pricingSnapshots)
    .where(eq(pricingSnapshots.source, source))
    .orderBy(desc(pricingSnapshots.publishedAt))
    .limit(1))
    .find((row) => row.status === "published") ?? null;
}

async function persistOpenRouterSnapshot(rows: OpenRouterNormalizedEndpoint[]) {
  const db = getDb();
  const snapshotId = `price_${randomUUID()}`;
  const payloadHash = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  const observedAt = new Date(rows[0]?.observedAt ?? Date.now());

  await db.insert(pricingSnapshots).values({
    id: snapshotId,
    source: "openrouter",
    status: "candidate",
    payloadHash,
    modelCount: rows.length,
    fetchedAt: observedAt,
    metadata: { sourceUrl: "https://openrouter.ai/api/v1/models" },
  });

  try {
    for (const row of rows) {
      await db.insert(inferenceEndpoints).values({
        id: row.id,
        canonicalModelId: row.canonicalModelId,
        inferenceProvider: row.inferenceProvider,
        externalModelId: row.externalModelId,
        source: "openrouter",
        contextWindow: row.contextWindow,
        maxOutputTokens: row.maxOutputTokens,
        status: "active",
        metadata: { displayName: row.name },
      }).onConflictDoUpdate({
        target: inferenceEndpoints.id,
        set: {
          canonicalModelId: row.canonicalModelId,
          contextWindow: row.contextWindow,
          maxOutputTokens: row.maxOutputTokens,
          status: "active",
          metadata: { displayName: row.name },
          updatedAt: new Date(),
        },
      });
      await db.insert(pricingRates).values({
        id: `rate_${randomUUID()}`,
        snapshotId,
        endpointId: row.id,
        inputPerMillion: decimal(row.pricing.input),
        cachedInputPerMillion: decimal(row.pricing.cachedInput),
        cacheWritePerMillion: decimal(row.pricing.cacheWrite),
        outputPerMillion: decimal(row.pricing.output),
        sourceUrl: row.sourceUrl,
        observedAt,
        metadata: {},
      });
    }
    const publishedAt = new Date();
    await db.update(pricingSnapshots).set({ status: "published", publishedAt }).where(eq(pricingSnapshots.id, snapshotId));
    return { snapshotId, modelCount: rows.length, publishedAt: publishedAt.toISOString(), payloadHash };
  } catch (error) {
    await db.update(pricingSnapshots).set({
      status: "failed",
      error: error instanceof Error ? error.message.slice(0, 500) : "PERSIST_FAILED",
    }).where(eq(pricingSnapshots.id, snapshotId));
    throw error;
  }
}

export async function refreshOpenRouterPricing(options: { apiKey?: string; fetchImpl?: typeof fetch } = {}) {
  if (!isDatabaseConfigured()) throw new Error("DATABASE_NOT_CONFIGURED");
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
  const rows = await fetchOpenRouterCatalog(apiKey, options.fetchImpl ?? fetch);
  if (rows.length < 10) throw new Error("OPENROUTER_SUSPICIOUSLY_SMALL_CATALOG");
  return persistOpenRouterSnapshot(rows);
}
