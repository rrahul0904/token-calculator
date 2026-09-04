import { effectivePublishedPricing } from "@/lib/pricing/store";

export async function GET(request: Request) {
  const modelId = new URL(request.url).searchParams.get("modelId");
  const result = await effectivePublishedPricing(modelId).catch(() => null);
  if (!result) return Response.json({ error: "PRICING_READ_FAILED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json({
    data: result.data,
    latestPublishedSnapshot: result.snapshot,
    fallback: result.source === "bundled",
    source: result.source,
    note: result.source === "published_snapshot"
      ? "Prices come from the latest successfully published immutable snapshot; active reviewed overrides are labeled."
      : "No published database snapshot is available, so the reviewed bundled catalog is used as a deterministic fallback.",
  }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
