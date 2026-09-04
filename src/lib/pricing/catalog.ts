import { MODEL_CATALOG, type ModelPricing } from "@/lib/models";

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

const directEndpoints: InferenceEndpointProfile[] = MODEL_CATALOG.filter((model) => model.provider !== "Z.AI").map((model) => ({
  id: `direct:${providerSlug(model.provider)}:${model.id}`,
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
    promotional: Boolean(model.pricingLabel?.toLowerCase().includes("promo") || model.pricingLabel?.toLowerCase().includes("off")),
  },
  status: model.status === "legacy" ? "legacy" : model.status === "preview" ? "preview" : "active",
}));

const routedEndpoints: InferenceEndpointProfile[] = [
  {
    id: "openrouter:z-ai/glm-5.3-flash",
    modelId: "glm-5.3-flash",
    inferenceProvider: "OpenRouter",
    externalModelId: "z-ai/glm-5.3-flash",
    contextWindow: 1_310_720,
    maxOutputTokens: 131_072,
    pricing: { input: 0.075, cachedInput: 0.015, output: 0.25 },
    provenance: {
      sourceType: "openrouter",
      sourceUrl: "https://openrouter.ai/z-ai/glm-5.3-flash",
      sourceLabel: "OpenRouter model pricing",
      verifiedAt: "2026-09-04",
      staleAfterHours: 24,
      promotional: true,
    },
    status: "active",
  },
];

export const INFERENCE_ENDPOINTS: InferenceEndpointProfile[] = [...directEndpoints, ...routedEndpoints];

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
