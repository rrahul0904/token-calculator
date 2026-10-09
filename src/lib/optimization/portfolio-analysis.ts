import {
  evaluateBudgetControl,
  type BudgetControlCandidate,
} from "./budget-control";
import {
  evaluateContextCompression,
  type ContextCompressionCandidate,
} from "./context-compression";
import {
  evaluateOptimizerPlan,
  type OptimizerPlanCandidate,
} from "./optimizer-plan";
import {
  evaluateOrchestrationEfficiency,
  type OrchestrationEfficiencyCandidate,
} from "./orchestration-efficiency";
import {
  evaluateOutputReduction,
  type OutputReductionCandidate,
} from "./output-reduction";
import {
  evaluatePersistentMemory,
  type PersistentMemoryCandidate,
} from "./persistent-memory";
import {
  evaluatePromptCacheEconomics,
  type PromptCacheEconomicsCandidate,
} from "./prompt-cache-economics";
import {
  evaluateRepositoryContext,
  type RepositoryContextCandidate,
} from "./repository-context";
import {
  evaluateResponseDensityPolicy,
  type ResponseDensityCandidate,
} from "./response-density-policy";
import {
  evaluateRoutingEconomics,
  type RoutingEconomicsCandidate,
} from "./routing-economics";
import {
  evaluateSemanticCache,
  type SemanticCacheCandidate,
} from "./semantic-cache";
import {
  evaluateStructuredEncoding,
  type StructuredEncodingCandidate,
} from "./structured-encoding";

export type TokenSavingAnalysisRequest =
  | { kind: "output_reduction"; candidate: OutputReductionCandidate }
  | { kind: "repository_context"; candidate: RepositoryContextCandidate }
  | { kind: "response_density"; candidate: ResponseDensityCandidate }
  | { kind: "structured_encoding"; candidate: StructuredEncodingCandidate }
  | { kind: "semantic_cache"; candidate: SemanticCacheCandidate }
  | { kind: "context_compression"; candidate: ContextCompressionCandidate }
  | { kind: "prompt_cache_economics"; candidate: PromptCacheEconomicsCandidate }
  | { kind: "routing_economics"; candidate: RoutingEconomicsCandidate }
  | { kind: "budget_control"; candidate: BudgetControlCandidate }
  | { kind: "persistent_memory"; candidate: PersistentMemoryCandidate }
  | { kind: "orchestration_efficiency"; candidate: OrchestrationEfficiencyCandidate }
  | { kind: "optimizer_plan"; candidate: OptimizerPlanCandidate };

export type TokenSavingAnalysisKind = TokenSavingAnalysisRequest["kind"];

export interface NormalizedPortfolioDecision {
  kind: TokenSavingAnalysisKind;
  id: string;
  status: string;
  claimable: boolean;
  claimClass: "token_reduction" | "cost_reduction_only";
  savingsPct: number | null;
  verificationRequired: string | null;
  raw: unknown;
}

export interface TokenSavingPortfolioAnalysisReport {
  version: 1;
  privacy: {
    metadataOnly: true;
    promptContentRequired: false;
    sourceCodeRequired: false;
    rawToolOutputRequired: false;
  };
  summary: {
    candidates: number;
    claimable: number;
    blocked: number;
    tokenReductionClaims: number;
    costOnlyClaims: number;
    additiveSavingsClaimed: false;
    aggregateSavingsPct: null;
  };
  decisions: NormalizedPortfolioDecision[];
}

function isCostOnlyKind(kind: TokenSavingAnalysisKind): boolean {
  return kind === "routing_economics"
    || kind === "prompt_cache_economics"
    || kind === "budget_control";
}

function normalize(
  kind: TokenSavingAnalysisKind,
  result: Record<string, unknown>,
): NormalizedPortfolioDecision {
  const costOnly = isCostOnlyKind(kind);
  const claimable = costOnly
    ? result.costSavingsClaimable === true
    : kind === "optimizer_plan"
      ? result.tokenSavingsClaimable === true
      : result.claimable === true;

  const savingsPct = costOnly
    ? asNullableNumber(result.measuredCostSavingsPct)
    : kind === "structured_encoding" || kind === "response_density"
      ? asNullableNumber(result.measuredSessionSavingsPct)
      : kind === "optimizer_plan"
        ? asNullableNumber(result.measuredPlanSavingsPct)
        : asNullableNumber(result.measuredSavingsPct);

  return {
    kind,
    id: String(result.id ?? "unknown"),
    status: String(result.status ?? "unknown"),
    claimable,
    claimClass: costOnly ? "cost_reduction_only" : "token_reduction",
    savingsPct,
    verificationRequired: typeof result.verificationRequired === "string"
      ? result.verificationRequired
      : null,
    raw: result,
  };
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Provider-neutral entry point for the Token Intelligence optimization
 * portfolio. Agents can submit one metadata-only candidate without knowing the
 * underlying evaluator implementation. The facade never adds component savings
 * together and preserves cost-only boundaries for routing, prompt caching and
 * budget controls.
 */
export function analyzeTokenSavingCandidate(
  request: TokenSavingAnalysisRequest,
  options: { minimumSampleSize?: number } = {},
): NormalizedPortfolioDecision {
  const minimumSampleSize = options.minimumSampleSize;

  switch (request.kind) {
    case "output_reduction":
      return normalize(request.kind, evaluateOutputReduction(request.candidate, { minimumSampleSize }) as unknown as Record<string, unknown>);
    case "repository_context":
      return normalize(request.kind, evaluateRepositoryContext(request.candidate, { minimumSampleSize }) as unknown as Record<string, unknown>);
    case "response_density":
      return normalize(request.kind, evaluateResponseDensityPolicy(request.candidate, { minimumSampleSize }) as unknown as Record<string, unknown>);
    case "structured_encoding":
      return normalize(request.kind, evaluateStructuredEncoding(request.candidate, { minimumSampleSize }) as unknown as Record<string, unknown>);
    case "semantic_cache":
      return normalize(request.kind, evaluateSemanticCache(request.candidate, { minimumSampleSize }) as unknown as Record<string, unknown>);
    case "context_compression":
      return normalize(request.kind, evaluateContextCompression(request.candidate, { minimumSampleSize }) as unknown as Record<string, unknown>);
    case "prompt_cache_economics":
      return normalize(request.kind, evaluatePromptCacheEconomics(request.candidate, { minimumSampleSize }) as unknown as Record<string, unknown>);
    case "routing_economics":
      return normalize(request.kind, evaluateRoutingEconomics(request.candidate, { minimumSampleSize }) as unknown as Record<string, unknown>);
    case "budget_control":
      return normalize(request.kind, evaluateBudgetControl(request.candidate, { minimumSampleSize }) as unknown as Record<string, unknown>);
    case "persistent_memory":
      return normalize(request.kind, evaluatePersistentMemory(request.candidate, { minimumSampleSize }) as unknown as Record<string, unknown>);
    case "orchestration_efficiency":
      return normalize(request.kind, evaluateOrchestrationEfficiency(request.candidate, { minimumSampleSize }) as unknown as Record<string, unknown>);
    case "optimizer_plan":
      return normalize(request.kind, evaluateOptimizerPlan(request.candidate, { minimumSampleSize }) as unknown as Record<string, unknown>);
  }
}

export function analyzeTokenSavingPortfolio(
  requests: readonly TokenSavingAnalysisRequest[],
  options: { minimumSampleSize?: number } = {},
): TokenSavingPortfolioAnalysisReport {
  const decisions = requests.map((request) => analyzeTokenSavingCandidate(request, options));
  const claimable = decisions.filter((decision) => decision.claimable);

  return {
    version: 1,
    privacy: {
      metadataOnly: true,
      promptContentRequired: false,
      sourceCodeRequired: false,
      rawToolOutputRequired: false,
    },
    summary: {
      candidates: decisions.length,
      claimable: claimable.length,
      blocked: decisions.length - claimable.length,
      tokenReductionClaims: claimable.filter((decision) => decision.claimClass === "token_reduction").length,
      costOnlyClaims: claimable.filter((decision) => decision.claimClass === "cost_reduction_only").length,
      additiveSavingsClaimed: false,
      aggregateSavingsPct: null,
    },
    decisions,
  };
}
