import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { inferenceEndpoints, pricingOverrides, pricingRates } from "@/db/schema";
import { INFERENCE_ENDPOINTS, isPricingStale } from "@/lib/pricing/catalog";
import { latestPublishedPricingSnapshot } from "@/lib/pricing/refresh";

function numeric(value: string | null) {
  return value === null ? null : Number(value);
}

function overridden(values: Record<string, number | null>, key: string, fallback: number | null) {
  return Object.prototype.hasOwnProperty.call(values, key) ? values[key] ?? null : fallback;
}

export async function effectivePublishedPricing(modelId?: string | null) {
  if (!isDatabaseConfigured()) {
    return {
      source: "bundled" as const,
      snapshot: null,
      data: INFERENCE_ENDPOINTS.filter((endpoint) => !modelId || endpoint.modelId === modelId).map((endpoint) => ({ ...endpoint, stale: isPricingStale(endpoint.provenance), override: null })),
    };
  }

  const snapshot = await latestPublishedPricingSnapshot();
  if (!snapshot) {
    return {
      source: "bundled" as const,
      snapshot: null,
      data: INFERENCE_ENDPOINTS.filter((endpoint) => !modelId || endpoint.modelId === modelId).map((endpoint) => ({ ...endpoint, stale: isPricingStale(endpoint.provenance), override: null })),
    };
  }

  const db = getDb();
  const baseCondition = modelId
    ? and(eq(pricingRates.snapshotId, snapshot.id), eq(inferenceEndpoints.canonicalModelId, modelId))
    : eq(pricingRates.snapshotId, snapshot.id);
  const rows = await db.select({
    endpointId: inferenceEndpoints.id,
    modelId: inferenceEndpoints.canonicalModelId,
    inferenceProvider: inferenceEndpoints.inferenceProvider,
    externalModelId: inferenceEndpoints.externalModelId,
    contextWindow: inferenceEndpoints.contextWindow,
    maxOutputTokens: inferenceEndpoints.maxOutputTokens,
    status: inferenceEndpoints.status,
    input: pricingRates.inputPerMillion,
    cachedInput: pricingRates.cachedInputPerMillion,
    cacheWrite: pricingRates.cacheWritePerMillion,
    output: pricingRates.outputPerMillion,
    sourceUrl: pricingRates.sourceUrl,
    observedAt: pricingRates.observedAt,
  }).from(pricingRates)
    .innerJoin(inferenceEndpoints, eq(pricingRates.endpointId, inferenceEndpoints.id))
    .where(baseCondition);

  const now = new Date();
  const overrides = await db.select().from(pricingOverrides).where(or(isNull(pricingOverrides.expiresAt), gt(pricingOverrides.expiresAt, now)));
  const overrideByEndpoint = new Map(overrides.map((item) => [item.endpointId, item]));

  return {
    source: "published_snapshot" as const,
    snapshot: {
      id: snapshot.id,
      source: snapshot.source,
      modelCount: snapshot.modelCount,
      fetchedAt: snapshot.fetchedAt,
      publishedAt: snapshot.publishedAt,
      payloadHash: snapshot.payloadHash,
    },
    data: rows.map((row) => {
      const override = overrideByEndpoint.get(row.endpointId);
      const values = override?.values ?? {};
      const verifiedAt = row.observedAt.toISOString().slice(0, 10);
      return {
        id: row.endpointId,
        modelId: row.modelId,
        inferenceProvider: row.inferenceProvider,
        externalModelId: row.externalModelId,
        contextWindow: row.contextWindow,
        maxOutputTokens: row.maxOutputTokens,
        status: row.status,
        pricing: {
          input: overridden(values, "input", numeric(row.input)),
          cachedInput: overridden(values, "cachedInput", numeric(row.cachedInput)),
          cacheWrite: overridden(values, "cacheWrite", numeric(row.cacheWrite)),
          output: overridden(values, "output", numeric(row.output)),
        },
        provenance: {
          sourceType: "openrouter",
          sourceUrl: row.sourceUrl,
          sourceLabel: "Published OpenRouter pricing snapshot",
          verifiedAt,
          staleAfterHours: 24,
        },
        stale: now.getTime() - row.observedAt.getTime() > 24 * 60 * 60 * 1000,
        override: override ? {
          id: override.id,
          reason: override.reason,
          expiresAt: override.expiresAt,
          createdAt: override.createdAt,
        } : null,
      };
    }),
  };
}
