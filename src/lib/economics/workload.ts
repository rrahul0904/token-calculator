import { pricingForInput } from "@/lib/cost";
import { MODEL_CATALOG, type ModelCatalogEntry, type ModelPricing } from "@/lib/models";

export type WorkloadMode = "tokens2cost" | "cost2tokens";

export interface WorkloadScenario {
  mode: WorkloadMode;
  modelId: string;
  endpointId?: string | null;
  pinnedModelId?: string | null;
  totalTokens: number;
  budgetUsd: number;
  inputPercent: number;
  cacheHitPercent: number;
  cacheableInputPercent: number;
  cacheWrite5mPercent: number;
  cacheWrite1hPercent: number;
  requestsPerMonth: number;
}

export interface CacheBuckets {
  inputTokens: number;
  outputTokens: number;
  cacheableInputTokens: number;
  cachedReadTokens: number;
  cacheMissTokens: number;
  dynamicInputTokens: number;
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  freshInputTokens: number;
}

export interface MoneyBreakdown {
  freshInputUsd: number | null;
  cachedReadUsd: number | null;
  cacheWrite5mUsd: number | null;
  cacheWrite1hUsd: number | null;
  outputUsd: number | null;
  totalUsd: number | null;
}

export interface WorkloadEstimate {
  modelId: string;
  modelName: string;
  provider: string;
  pricingTier: string;
  pricing: ModelPricing;
  pricingVerifiedAt: string;
  pricingSourceUrl: string;
  buckets: CacheBuckets;
  cost: MoneyBreakdown;
  noCacheCostUsd: number | null;
  cacheSavingsUsd: number | null;
  cacheSavingsPercent: number | null;
  monthlyCostUsd: number | null;
  contextFits: boolean;
  contextUtilizationPercent: number;
}

export interface PinnedComparison {
  baseline: WorkloadEstimate;
  candidate: WorkloadEstimate;
  requestCostDeltaUsd: number | null;
  requestCostDeltaPercent: number | null;
  monthlyCostDeltaUsd: number | null;
  classification: "same_model" | "same_provider" | "economic_alternative";
  qualityEquivalent: false;
}

export interface QualityEvidence {
  source: string;
  sourceUrl: string;
  benchmark: string;
  observedAt: string;
}

export interface FrontierCandidate {
  id: string;
  label: string;
  costUsd: number | null;
  qualityScore: number | null;
  qualityEvidence?: QualityEvidence | null;
}

export interface FrontierResult {
  candidates: FrontierCandidate[];
  frontier: FrontierCandidate[];
  omittedWithoutEvidence: string[];
}

export const MAX_PLANNING_TOKENS = 1_000_000_000_000_000;

export const DEFAULT_WORKLOAD_SCENARIO: WorkloadScenario = {
  mode: "tokens2cost",
  modelId: "glm-5.3-flash",
  endpointId: null,
  pinnedModelId: null,
  totalTokens: 1_000_000_000,
  budgetUsd: 100,
  inputPercent: 99,
  cacheHitPercent: 98,
  cacheableInputPercent: 100,
  cacheWrite5mPercent: 0,
  cacheWrite1hPercent: 0,
  requestsPerMonth: 1,
};

export const WORKLOAD_PRESETS = [
  { id: "chatbot", label: "Chatbot", totalTokens: 12_000, inputPercent: 82, cacheableInputPercent: 35, cacheHitPercent: 60, requestsPerMonth: 100_000 },
  { id: "rag", label: "RAG", totalTokens: 45_000, inputPercent: 92, cacheableInputPercent: 55, cacheHitPercent: 75, requestsPerMonth: 50_000 },
  { id: "coding-agent", label: "Coding Agent", totalTokens: 180_000, inputPercent: 88, cacheableInputPercent: 70, cacheHitPercent: 85, requestsPerMonth: 12_000 },
  { id: "research-agent", label: "Research Agent", totalTokens: 240_000, inputPercent: 83, cacheableInputPercent: 45, cacheHitPercent: 65, requestsPerMonth: 4_000 },
  { id: "data-agent", label: "Data / SQL Agent", totalTokens: 95_000, inputPercent: 91, cacheableInputPercent: 65, cacheHitPercent: 80, requestsPerMonth: 15_000 },
  { id: "document-extraction", label: "Document Extraction", totalTokens: 130_000, inputPercent: 97, cacheableInputPercent: 10, cacheHitPercent: 30, requestsPerMonth: 25_000 },
  { id: "batch-classification", label: "Batch Classification", totalTokens: 4_000, inputPercent: 98, cacheableInputPercent: 20, cacheHitPercent: 50, requestsPerMonth: 1_000_000 },
] as const;

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function clampPercent(value: number) {
  return Math.min(100, Math.max(0, finite(value)));
}

export function clampPlanningTokens(value: number) {
  return Math.min(MAX_PLANNING_TOKENS, Math.max(0, Math.round(finite(value))));
}

export function splitTotalTokens(totalTokens: number, inputPercent: number) {
  const total = clampPlanningTokens(totalTokens);
  const input = Math.round(total * clampPercent(inputPercent) / 100);
  return { inputTokens: input, outputTokens: Math.max(0, total - input) };
}

export function deriveCacheBuckets(
  totalTokens: number,
  inputPercent: number,
  cacheableInputPercent: number,
  cacheHitPercent: number,
  cacheWrite5mPercent = 0,
  cacheWrite1hPercent = 0,
): CacheBuckets {
  const { inputTokens, outputTokens } = splitTotalTokens(totalTokens, inputPercent);
  const cacheableInputTokens = Math.round(inputTokens * clampPercent(cacheableInputPercent) / 100);
  const cachedReadTokens = Math.round(cacheableInputTokens * clampPercent(cacheHitPercent) / 100);
  const cacheMissTokens = Math.max(0, cacheableInputTokens - cachedReadTokens);
  const dynamicInputTokens = Math.max(0, inputTokens - cacheableInputTokens);
  const write5Pct = clampPercent(cacheWrite5mPercent);
  const write1Pct = Math.min(clampPercent(cacheWrite1hPercent), 100 - write5Pct);
  const cacheWrite5mTokens = Math.round(cacheMissTokens * write5Pct / 100);
  const cacheWrite1hTokens = Math.round(cacheMissTokens * write1Pct / 100);
  const freshInputTokens = Math.max(0, inputTokens - cachedReadTokens - cacheWrite5mTokens - cacheWrite1hTokens);
  return {
    inputTokens,
    outputTokens,
    cacheableInputTokens,
    cachedReadTokens,
    cacheMissTokens,
    dynamicInputTokens,
    cacheWrite5mTokens,
    cacheWrite1hTokens,
    freshInputTokens,
  };
}

function componentCost(tokens: number, rate: number | undefined): number | null {
  if (tokens <= 0) return 0;
  if (rate === undefined || !Number.isFinite(rate)) return null;
  return (tokens / 1_000_000) * rate;
}

function sumKnown(values: Array<number | null>) {
  if (values.some((value) => value === null)) return null;
  return (values as number[]).reduce((sum, value) => sum + value, 0);
}

export function modelForWorkload(modelId: string): ModelCatalogEntry | null {
  return MODEL_CATALOG.find((model) => model.id === modelId) ?? null;
}

export function estimateWorkload(model: ModelCatalogEntry, scenario: WorkloadScenario): WorkloadEstimate {
  const buckets = deriveCacheBuckets(
    scenario.totalTokens,
    scenario.inputPercent,
    scenario.cacheableInputPercent,
    scenario.cacheHitPercent,
    scenario.cacheWrite5mPercent,
    scenario.cacheWrite1hPercent,
  );
  const { pricing, tier } = pricingForInput(model, buckets.inputTokens);
  const freshInputUsd = componentCost(buckets.freshInputTokens, pricing.input);
  const cachedReadUsd = componentCost(buckets.cachedReadTokens, pricing.cachedInput);
  const cacheWrite5mUsd = componentCost(buckets.cacheWrite5mTokens, pricing.cacheWrite5m);
  const cacheWrite1hUsd = componentCost(buckets.cacheWrite1hTokens, pricing.cacheWrite1h);
  const outputUsd = componentCost(buckets.outputTokens, pricing.output);
  const totalUsd = sumKnown([freshInputUsd, cachedReadUsd, cacheWrite5mUsd, cacheWrite1hUsd, outputUsd]);
  const noCacheCostUsd = sumKnown([
    componentCost(buckets.inputTokens, pricing.input),
    componentCost(buckets.outputTokens, pricing.output),
  ]);
  const cacheSavingsUsd = totalUsd === null || noCacheCostUsd === null ? null : noCacheCostUsd - totalUsd;
  const cacheSavingsPercent = cacheSavingsUsd === null || noCacheCostUsd === null || noCacheCostUsd === 0
    ? null
    : cacheSavingsUsd / noCacheCostUsd * 100;
  const monthlyCostUsd = totalUsd === null ? null : totalUsd * Math.max(0, finite(scenario.requestsPerMonth));
  const contextTotal = buckets.inputTokens + buckets.outputTokens;
  return {
    modelId: model.id,
    modelName: model.name,
    provider: model.provider,
    pricingTier: tier,
    pricing,
    pricingVerifiedAt: model.verifiedAt,
    pricingSourceUrl: model.sourceUrl,
    buckets,
    cost: { freshInputUsd, cachedReadUsd, cacheWrite5mUsd, cacheWrite1hUsd, outputUsd, totalUsd },
    noCacheCostUsd,
    cacheSavingsUsd,
    cacheSavingsPercent,
    monthlyCostUsd,
    contextFits: contextTotal <= model.contextWindow,
    contextUtilizationPercent: model.contextWindow > 0 ? Math.min(999, contextTotal / model.contextWindow * 100) : 0,
  };
}

export function solveTokensForBudget(model: ModelCatalogEntry, scenario: WorkloadScenario): WorkloadEstimate | null {
  const budget = Math.max(0, finite(scenario.budgetUsd));
  if (budget === 0) return estimateWorkload(model, { ...scenario, totalTokens: 0, mode: "tokens2cost" });
  const probe = estimateWorkload(model, { ...scenario, totalTokens: 1_000_000, mode: "tokens2cost" });
  if (probe.cost.totalUsd === null || probe.cost.totalUsd <= 0) return null;

  let low = 0;
  let high = 1_000_000;
  while (high < MAX_PLANNING_TOKENS) {
    const estimate = estimateWorkload(model, { ...scenario, totalTokens: high, mode: "tokens2cost" });
    if (estimate.cost.totalUsd === null) return null;
    if (estimate.cost.totalUsd > budget) break;
    low = high;
    high = Math.min(MAX_PLANNING_TOKENS, high * 2);
    if (high === MAX_PLANNING_TOKENS) break;
  }

  for (let index = 0; index < 64 && low + 1 < high; index += 1) {
    const mid = Math.floor((low + high) / 2);
    const estimate = estimateWorkload(model, { ...scenario, totalTokens: mid, mode: "tokens2cost" });
    if (estimate.cost.totalUsd !== null && estimate.cost.totalUsd <= budget) low = mid;
    else high = mid;
  }
  return estimateWorkload(model, { ...scenario, totalTokens: low, mode: "tokens2cost" });
}

export function resolveScenarioEstimate(scenario: WorkloadScenario): WorkloadEstimate | null {
  const model = modelForWorkload(scenario.modelId);
  if (!model) return null;
  return scenario.mode === "cost2tokens" ? solveTokensForBudget(model, scenario) : estimateWorkload(model, scenario);
}

export function compareWithPinned(baselineModel: ModelCatalogEntry, candidateModel: ModelCatalogEntry, scenario: WorkloadScenario): PinnedComparison {
  const baseline = estimateWorkload(baselineModel, scenario);
  const candidate = estimateWorkload(candidateModel, scenario);
  const baseCost = baseline.cost.totalUsd;
  const candidateCost = candidate.cost.totalUsd;
  const requestCostDeltaUsd = baseCost === null || candidateCost === null ? null : candidateCost - baseCost;
  const requestCostDeltaPercent = requestCostDeltaUsd === null || baseCost === null || baseCost === 0 ? null : requestCostDeltaUsd / baseCost * 100;
  const monthlyCostDeltaUsd = baseline.monthlyCostUsd === null || candidate.monthlyCostUsd === null ? null : candidate.monthlyCostUsd - baseline.monthlyCostUsd;
  return {
    baseline,
    candidate,
    requestCostDeltaUsd,
    requestCostDeltaPercent,
    monthlyCostDeltaUsd,
    classification: baselineModel.id === candidateModel.id
      ? "same_model"
      : baselineModel.provider === candidateModel.provider ? "same_provider" : "economic_alternative",
    qualityEquivalent: false,
  };
}

export function computeCostQualityFrontier(candidates: FrontierCandidate[]): FrontierResult {
  const evidenced = candidates.filter((candidate) =>
    candidate.costUsd !== null &&
    candidate.qualityScore !== null &&
    candidate.qualityEvidence?.sourceUrl &&
    Number.isFinite(candidate.costUsd) &&
    Number.isFinite(candidate.qualityScore),
  );
  const frontier = evidenced.filter((candidate) => !evidenced.some((other) => {
    if (other.id === candidate.id) return false;
    const noWorse = (other.costUsd as number) <= (candidate.costUsd as number) && (other.qualityScore as number) >= (candidate.qualityScore as number);
    const strictlyBetter = (other.costUsd as number) < (candidate.costUsd as number) || (other.qualityScore as number) > (candidate.qualityScore as number);
    return noWorse && strictlyBetter;
  })).sort((a, b) => (a.costUsd as number) - (b.costUsd as number));
  return {
    candidates: evidenced,
    frontier,
    omittedWithoutEvidence: candidates.filter((candidate) => !evidenced.includes(candidate)).map((candidate) => candidate.id),
  };
}

function queryNumber(params: URLSearchParams, key: string, fallback: number) {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function parseWorkloadQuery(input: string | URLSearchParams): WorkloadScenario {
  const params = typeof input === "string"
    ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
    : input;
  const mode = params.get("mode") === "cost2tokens" ? "cost2tokens" : "tokens2cost";
  const requestedModel = params.get("model") ?? DEFAULT_WORKLOAD_SCENARIO.modelId;
  const modelId = MODEL_CATALOG.some((model) => model.id === requestedModel) ? requestedModel : DEFAULT_WORKLOAD_SCENARIO.modelId;
  return {
    mode,
    modelId,
    endpointId: params.get("endpoint"),
    pinnedModelId: params.get("pin"),
    totalTokens: clampPlanningTokens(queryNumber(params, "tokens", DEFAULT_WORKLOAD_SCENARIO.totalTokens)),
    budgetUsd: Math.max(0, queryNumber(params, "budget", DEFAULT_WORKLOAD_SCENARIO.budgetUsd)),
    inputPercent: clampPercent(queryNumber(params, "input", DEFAULT_WORKLOAD_SCENARIO.inputPercent)),
    cacheHitPercent: clampPercent(queryNumber(params, "cache", DEFAULT_WORKLOAD_SCENARIO.cacheHitPercent)),
    cacheableInputPercent: clampPercent(queryNumber(params, "cacheable", DEFAULT_WORKLOAD_SCENARIO.cacheableInputPercent)),
    cacheWrite5mPercent: clampPercent(queryNumber(params, "write5m", DEFAULT_WORKLOAD_SCENARIO.cacheWrite5mPercent)),
    cacheWrite1hPercent: clampPercent(queryNumber(params, "write1h", DEFAULT_WORKLOAD_SCENARIO.cacheWrite1hPercent)),
    requestsPerMonth: Math.max(0, Math.round(queryNumber(params, "requests", DEFAULT_WORKLOAD_SCENARIO.requestsPerMonth))),
  };
}

function stableNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

export function serializeWorkloadQuery(scenario: WorkloadScenario) {
  const params = new URLSearchParams();
  params.set("model", scenario.modelId);
  if (scenario.endpointId) params.set("endpoint", scenario.endpointId);
  params.set("mode", scenario.mode);
  params.set("tokens", stableNumber(clampPlanningTokens(scenario.totalTokens)));
  params.set("budget", stableNumber(Math.max(0, finite(scenario.budgetUsd))));
  params.set("input", stableNumber(clampPercent(scenario.inputPercent)));
  params.set("cache", stableNumber(clampPercent(scenario.cacheHitPercent)));
  params.set("cacheable", stableNumber(clampPercent(scenario.cacheableInputPercent)));
  params.set("write5m", stableNumber(clampPercent(scenario.cacheWrite5mPercent)));
  params.set("write1h", stableNumber(clampPercent(scenario.cacheWrite1hPercent)));
  params.set("requests", stableNumber(Math.max(0, Math.round(finite(scenario.requestsPerMonth)))));
  if (scenario.pinnedModelId) params.set("pin", scenario.pinnedModelId);
  return params.toString();
}
