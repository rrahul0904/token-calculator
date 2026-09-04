import { MODEL_CATALOG } from "@/lib/models";
import type { InferenceEndpointProfile } from "@/lib/pricing/catalog";

function providerSlug(provider: string) {
  return provider.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function reviewedOfficialEndpoints(): InferenceEndpointProfile[] {
  return MODEL_CATALOG.filter((model) => model.provider !== "Z.AI").map((model) => ({
    id: "direct:" + providerSlug(model.provider) + ":" + model.id,
    modelId: model.id,
    inferenceProvider: model.provider,
    externalModelId: model.id,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutput,
    pricing: model.pricing,
    provenance: {
      sourceType: "official_provider",
      sourceUrl: model.sourceUrl,
      sourceLabel: model.sourceLabel,
      verifiedAt: model.verifiedAt,
      staleAfterHours: 168,
      promotional: Boolean(model.pricingLabel?.toLowerCase().includes("promo")),
    },
    status: model.status === "legacy" ? "legacy" : model.status === "preview" ? "preview" : "active",
  }));
}
