import { MODEL_CATALOG, type ModelPricing } from "@/lib/models";
import { resolvePricing } from "@/lib/pricing";

export type PricingSourceType = "official_provider" | "openrouter" | "manual_reviewed";

export interface PricingProvenance {
  sourceType: PricingSourceType;
  sourceUrl: string;
  sourceLabel: string;
  verifiedAt: string;
  staleAfterHours: number;
  promotional?: boolean;
}

export interface InferenceEndpointProfile {
  id: string;
  modelId: string;
  inferenceProvider: string;
  externalModelId: string;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  pricing: ModelPricing & { cacheWrite?: number };
  provenance: PricingProvenance;
  status: "active" | "preview" | "legacy";
}

function providerSlug(provider: string) {
  return provider.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const directEndpoints: InferenceEndpointProfile[] = MODEL_CATALOG.map((model) => {
  const resolved = resolvePricing({ model, inputTokens: 0 });
  return {
    id: `direct:${providerSlug(model.provider)}:${model.id}`,
    modelId: model.id,
    inferenceProvider: model.provider,
    externalModelId: model.id,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutput,
    pricing: resolved.pricing,
    provenance: {
      sourceType: "official_provider" as const,
      sourceUrl: resolved.sourceUrl,
      sourceLabel: model.sourceLabel,
      verifiedAt: resolved.verifiedAt,
      staleAfterHours: 168,
      promotional: Boolean(
        resolved.version?.label?.toLowerCase().includes("intro") ||
        model.pricingLabel?.toLowerCase().includes("promo") ||
        model.pricingLabel?.toLowerCase().includes("off"),
      ),
    },
    status:
      model.status === "legacy"
        ? "legacy" as const
        : model.status === "preview"
          ? "preview" as const
          : "active" as const,
  };
});

// Routed-provider endpoints are deliberately empty until a source-backed adapter
// refreshes them. The workload engine must never fabricate routed pricing.
const routedEndpoints: InferenceEndpointProfile[] = [];

export const INFERENCE_ENDPOINTS: InferenceEndpointProfile[] = [
  ...directEndpoints,
  ...routedEndpoints,
];

export function endpointsForModel(modelId: string) {
  return INFERENCE_ENDPOINTS.filter((endpoint) => endpoint.modelId === modelId);
}

export function endpointById(endpointId: string | null | undefined) {
  if (!endpointId) return null;
  return INFERENCE_ENDPOINTS.find((endpoint) => endpoint.id === endpointId) ?? null;
}

export function defaultEndpointForModel(modelId: string) {
  return endpointsForModel(modelId).find((endpoint) => endpoint.id.startsWith("openrouter:"))
    ?? endpointsForModel(modelId)[0]
    ?? null;
}

export function isPricingStale(provenance: PricingProvenance, now = new Date()) {
  const verified = Date.parse(`${provenance.verifiedAt}T00:00:00Z`);
  if (!Number.isFinite(verified)) return true;
  return now.getTime() - verified > provenance.staleAfterHours * 60 * 60 * 1000;
}
