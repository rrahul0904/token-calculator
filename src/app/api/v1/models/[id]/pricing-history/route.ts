import { getModel, getModelPricingHistory } from "@/lib/model-discovery";

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": status === 200 ? "public, max-age=300, stale-while-revalidate=3600" : "no-store" } });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const model = getModel(id);
  if (!model) return reply({ error: "NOT_FOUND", errorDetail: { code: "NOT_FOUND", message: "Model ID is not present in the Token Intelligence catalog." } }, 404);
  return reply({
    data: {
      model: { id: model.id, name: model.name, provider: model.provider },
      history: getModelPricingHistory(model),
      note: "Only source-backed pricing windows represented in the catalog are returned; unknown history is not fabricated.",
    },
  });
}
