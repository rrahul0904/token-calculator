import { MODEL_CATALOG } from "@/lib/models";

export async function GET() {
  return Response.json({
    data: MODEL_CATALOG.map((model) => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
      contextWindow: model.contextWindow,
      maxOutput: model.maxOutput,
      tokenizerAccuracy: model.tokenizerAccuracy,
      pricing: model.pricing,
      longContext: model.longContext ?? null,
      pricingLabel: model.pricingLabel ?? null,
      pricingSourceUrl: model.sourceUrl,
      pricingSourceLabel: model.sourceLabel,
      verifiedAt: model.verifiedAt,
      status: model.status ?? "current",
    })),
    precision: {
      openai: "Local o200k reference; provider billing may differ by model/request framing.",
      otherProviders: "Tokenizer counts are estimates unless a provider or agent reports measured usage.",
    },
  }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
