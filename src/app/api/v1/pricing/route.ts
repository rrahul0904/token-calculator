import { isDatabaseConfigured } from "@/db/client";
import { INFERENCE_ENDPOINTS, isPricingStale } from "@/lib/pricing/catalog";
import { latestPublishedPricingSnapshot } from "@/lib/pricing/refresh";

export async function GET(request: Request) {
  const modelId = new URL(request.url).searchParams.get("modelId");
  const endpoints = INFERENCE_ENDPOINTS
    .filter((endpoint) => !modelId || endpoint.modelId === modelId)
    .map((endpoint) => ({
      ...endpoint,
      stale: isPricingStale(endpoint.provenance),
    }));
  const latestPublished = isDatabaseConfigured() ? await latestPublishedPricingSnapshot().catch(() => null) : null;
  return Response.json({
    data: endpoints,
    latestPublishedSnapshot: latestPublished ? {
      id: latestPublished.id,
      source: latestPublished.source,
      modelCount: latestPublished.modelCount,
      fetchedAt: latestPublished.fetchedAt,
      publishedAt: latestPublished.publishedAt,
      payloadHash: latestPublished.payloadHash,
    } : null,
    fallback: latestPublished ? false : true,
    note: latestPublished
      ? "A persisted pricing snapshot exists; public bundled endpoints remain the deterministic browser fallback."
      : "No persisted refresh snapshot is configured, so the reviewed bundled pricing catalog is the current fallback.",
  }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
