import { endpointsForModel, isPricingStale } from "@/lib/pricing/catalog";
import { MODEL_CATALOG } from "@/lib/models";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const model = MODEL_CATALOG.find((item) => item.id === id);
  if (!model) return Response.json({ error: "MODEL_NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json({
    data: endpointsForModel(id).map((endpoint) => ({ ...endpoint, stale: isPricingStale(endpoint.provenance) })),
    model: { id: model.id, name: model.name, provider: model.provider },
  }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
