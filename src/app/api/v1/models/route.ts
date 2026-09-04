import { MODEL_CATALOG } from "@/lib/models";
import { serializeModel } from "@/lib/model-discovery";

export async function GET() {
  return Response.json({
    data: MODEL_CATALOG.map((model) => {
      const normalized = serializeModel(model);
      return {
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
        tokenizer: normalized.tokenizer,
        effectivePricing: normalized.pricing,
        modelUrl: `/models/${model.id}`,
        pricingHistoryUrl: `/models/${model.id}/pricing-history`,
      };
    }),
    precision: {
      openai: "Local o200k provider-reference tokenizer; provider billing may differ by model/request framing.",
      otherProviders: "Tokenizer counts are explicitly estimated unless a provider or agent reports measured usage.",
    },
  }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
