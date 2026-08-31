import { calculateCost, contextUsage } from "@/lib/cost";
import { MODEL_CATALOG, type ModelCatalogEntry, type ProviderName } from "@/lib/models";

export interface EstimateRequest {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWrite5mTokens?: number;
  cacheWrite1hTokens?: number;
  requestsPerMonth?: number;
  providers?: ProviderName[];
  modelIds?: string[];
  minimumContextWindow?: number;
  allowedModelIds?: string[];
}

export interface ModelEstimate {
  modelId: string;
  modelName: string;
  provider: ProviderName;
  contextWindow: number;
  tokenizerAccuracy: "reference" | "estimate";
  pricingVerifiedAt: string;
  pricingSourceUrl: string;
  pricingTier: string;
  requestCostUsd: number;
  monthlyCostUsd: number | null;
  contextUtilizationPct: number;
  fitsContext: boolean;
  costBreakdown: ReturnType<typeof calculateCost>;
}

export function eligibleModels(request: EstimateRequest): ModelCatalogEntry[] {
  const modelIds = request.modelIds ? new Set(request.modelIds) : null;
  const allowed = request.allowedModelIds ? new Set(request.allowedModelIds) : null;
  const providers = request.providers ? new Set(request.providers) : null;
  return MODEL_CATALOG.filter((model) => {
    if (modelIds && !modelIds.has(model.id)) return false;
    if (allowed && !allowed.has(model.id)) return false;
    if (providers && !providers.has(model.provider)) return false;
    if (request.minimumContextWindow && model.contextWindow < request.minimumContextWindow) return false;
    return true;
  });
}

export function estimateAcrossModels(request: EstimateRequest): ModelEstimate[] {
  const requestsPerMonth = request.requestsPerMonth ?? null;
  return eligibleModels(request).map((model) => {
    const costBreakdown = calculateCost(model, {
      inputTokens: request.inputTokens,
      outputTokens: request.outputTokens,
      cachedInputTokens: request.cachedInputTokens,
      cacheWrite5mTokens: request.cacheWrite5mTokens,
      cacheWrite1hTokens: request.cacheWrite1hTokens,
    });
    const utilization = contextUsage(request.inputTokens, request.outputTokens, model.contextWindow);
    return {
      modelId: model.id,
      modelName: model.name,
      provider: model.provider,
      contextWindow: model.contextWindow,
      tokenizerAccuracy: model.tokenizerAccuracy,
      pricingVerifiedAt: model.verifiedAt,
      pricingSourceUrl: model.sourceUrl,
      pricingTier: costBreakdown.pricingTier,
      requestCostUsd: costBreakdown.total,
      monthlyCostUsd: requestsPerMonth === null ? null : costBreakdown.total * Math.max(requestsPerMonth, 0),
      contextUtilizationPct: utilization,
      fitsContext: request.inputTokens + request.outputTokens <= model.contextWindow,
      costBreakdown,
    };
  });
}

export function recommendCheapestPermitted(request: EstimateRequest): ModelEstimate | null {
  const candidates = estimateAcrossModels(request)
    .filter((estimate) => estimate.fitsContext)
    .sort((a, b) => a.requestCostUsd - b.requestCostUsd || b.contextWindow - a.contextWindow);
  return candidates[0] ?? null;
}

export function compareScenarios(a: EstimateRequest, b: EstimateRequest) {
  const models = Array.from(new Set([
    ...eligibleModels(a).map((model) => model.id),
    ...eligibleModels(b).map((model) => model.id),
  ]));
  const aById = new Map(estimateAcrossModels({ ...a, modelIds: models }).map((item) => [item.modelId, item]));
  const bById = new Map(estimateAcrossModels({ ...b, modelIds: models }).map((item) => [item.modelId, item]));
  return models.flatMap((modelId) => {
    const left = aById.get(modelId);
    const right = bById.get(modelId);
    if (!left || !right) return [];
    return [{
      modelId,
      modelName: left.modelName,
      provider: left.provider,
      a: left,
      b: right,
      requestCostDeltaUsd: right.requestCostUsd - left.requestCostUsd,
      requestCostDeltaPct: left.requestCostUsd === 0 ? null : ((right.requestCostUsd - left.requestCostUsd) / left.requestCostUsd) * 100,
      inputTokenDelta: b.inputTokens - a.inputTokens,
      outputTokenDelta: b.outputTokens - a.outputTokens,
    }];
  });
}
