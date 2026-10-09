import * as z from "zod/v4";
import { getRunDetail } from "@/lib/app-data";
import {
  createTokenIntelligenceMcpServer as createBaseTokenIntelligenceMcpServer,
  type McpPrincipal,
} from "@/lib/mcp/base-server";
import { evaluateBudgetControl } from "@/lib/optimization/budget-control";
import { buildCapabilityCoverageReport } from "@/lib/optimization/capability-coverage";
import { evaluateOrchestrationEfficiency } from "@/lib/optimization/orchestration-efficiency";
import type {
  StoredOutcomeReceiptInput,
  StoredRunReceiptInput,
} from "@/lib/optimization/paired-run-evidence";
import { evaluatePromptCacheEconomics } from "@/lib/optimization/prompt-cache-economics";
import { analyzeReceiptBackedOptimizerPlan } from "@/lib/optimization/receipt-backed-optimizer-plan";

export type { McpPrincipal } from "@/lib/mcp/base-server";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const evidenceTypeSchema = z.enum(["measured_before_after", "historical_observation", "modeled_estimate", "unknown"]);
const qualityGateSchema = z.enum(["passed", "failed", "not_run"]);
const optionalNullableNonNegative = z.number().nonnegative().nullable().optional();

const optimizerComponentSchema = z.object({
  id: z.string().min(1),
  familyKey: z.string().min(1),
  claimClass: z.enum(["token_reduction_candidate", "mixed_token_and_cost_candidate", "cost_reduction_only"]),
  individualClaimable: z.boolean(),
  individualSavingsPct: z.number().nonnegative().nullable().optional(),
}).strict();

const receiptBackedOptimizerPlanInput = z.object({
  id: z.string().min(1),
  components: z.array(optimizerComponentSchema).min(1).max(50),
  pairs: z.array(z.object({
    caseId: z.string().min(1),
    baselineRunId: z.string().min(1),
    candidateRunId: z.string().min(1),
  }).strict()).min(1).max(100),
  minimumSampleSize: z.number().int().min(1).max(100).default(5),
  qualityNonInferiorityMargin: z.number().min(0).max(1).default(0.02),
  minimumQualityScore: z.number().min(0).max(1).nullable().optional(),
  maxCostRegressionPct: z.number().min(0).max(1000).default(0),
}).strict();

const promptCacheEconomicsInput = z.object({
  id: z.string().min(1),
  policyVersion: z.string().nullable().optional(),
  evidenceType: evidenceTypeSchema,
  qualityGate: qualityGateSchema,
  cacheAccountingGate: z.enum(["verified", "failed", "not_run"]),
  sampleSize: z.number().int().nonnegative(),
  baselineCostUsd: z.number().nonnegative().nullable(),
  candidateCostUsd: z.number().nonnegative().nullable(),
  cacheControlOverheadCostUsd: optionalNullableNonNegative,
  fallbackCostUsd: optionalNullableNonNegative,
  baselineLogicalTokens: optionalNullableNonNegative,
  candidateLogicalTokens: optionalNullableNonNegative,
  cacheReadTokens: optionalNullableNonNegative,
  cacheWriteTokens: optionalNullableNonNegative,
  fallbackTokens: optionalNullableNonNegative,
  stablePrefixRate: z.number().min(0).max(1).nullable().optional(),
  minimumStablePrefixRate: z.number().min(0).max(1).optional(),
  evidenceSource: z.string().nullable().optional(),
  minimumSampleSize: z.number().int().min(1).max(100).default(5),
}).strict();

const budgetControlInput = z.object({
  id: z.string().min(1),
  policyVersion: z.string().nullable().optional(),
  evidenceType: evidenceTypeSchema,
  qualityGate: qualityGateSchema,
  enforcementGate: z.enum(["verified", "failed", "not_run"]),
  sampleSize: z.number().int().nonnegative(),
  budgetLimitUsd: z.number().nonnegative(),
  baselineCostUsd: z.number().nonnegative().nullable(),
  candidateCostUsd: z.number().nonnegative().nullable(),
  controlPlaneOverheadCostUsd: optionalNullableNonNegative,
  baselineSessionTokens: optionalNullableNonNegative,
  candidateSessionTokens: optionalNullableNonNegative,
  hardLimitBreaches: z.number().int().nonnegative().optional(),
  policyBypasses: z.number().int().nonnegative().optional(),
  requiredWorkDenied: z.number().int().nonnegative().optional(),
  evidenceSource: z.string().nullable().optional(),
  minimumSampleSize: z.number().int().min(1).max(100).default(5),
}).strict();

const orchestrationEfficiencyInput = z.object({
  id: z.string().min(1),
  orchestrationVersion: z.string().nullable().optional(),
  evidenceType: evidenceTypeSchema,
  qualityGate: qualityGateSchema,
  provenanceGate: z.enum(["verified", "failed", "not_run"]),
  sampleSize: z.number().int().nonnegative(),
  baselineSessionTokens: z.number().nonnegative().nullable(),
  candidateWorkerTokens: z.number().nonnegative().nullable(),
  coordinatorTokens: optionalNullableNonNegative,
  handoffTokens: optionalNullableNonNegative,
  retryTokens: optionalNullableNonNegative,
  fallbackTokens: optionalNullableNonNegative,
  baselineCostUsd: optionalNullableNonNegative,
  candidateWorkerCostUsd: optionalNullableNonNegative,
  coordinatorCostUsd: optionalNullableNonNegative,
  fallbackCostUsd: optionalNullableNonNegative,
  observedMaxFanout: z.number().int().nonnegative().optional(),
  maxAllowedFanout: z.number().int().positive().optional(),
  evidenceSource: z.string().nullable().optional(),
  minimumSampleSize: z.number().int().min(1).max(100).default(5),
}).strict();

type RunDetail = NonNullable<Awaited<ReturnType<typeof getRunDetail>>>;

function storedRun(run: RunDetail["run"]): StoredRunReceiptInput {
  return {
    id: run.id,
    endedAt: run.endedAt,
    reconciledCostUsd: run.reconciledCostUsd,
    actualCostUsd: run.actualCostUsd,
    usageSource: run.usageSource,
    agentVendor: run.agentVendor ?? "unknown",
    freshInputTokens: run.freshInputTokens,
    cacheReadTokens: run.cacheReadTokens,
    cacheWriteTokens: run.cacheWriteTokens,
    reasoningTokens: run.reasoningTokens,
    outputTokens: run.outputTokens,
    retryCount: run.retryCount,
    fallbackCount: run.fallbackCount,
  };
}

function storedOutcome(outcome: RunDetail["outcome"]): StoredOutcomeReceiptInput | null {
  if (!outcome) return null;
  return {
    score: outcome.score,
    taskCompleted: outcome.taskCompleted,
    testsPassed: outcome.testsPassed,
  };
}

export function createTokenIntelligenceMcpServer(principal: McpPrincipal) {
  const server = createBaseTokenIntelligenceMcpServer(principal);

  server.registerTool(
    "analyze_receipt_backed_optimizer_plan",
    {
      description: "Evaluate a token/cost optimizer combination from tenant-scoped stored baseline/candidate run IDs. Token economics, retries, fallbacks and quality are derived from canonical run/outcome receipts; callers cannot submit those values directly and component percentages are never summed.",
      inputSchema: receiptBackedOptimizerPlanInput,
    },
    async ({
      id,
      components,
      pairs,
      minimumSampleSize,
      qualityNonInferiorityMargin,
      minimumQualityScore,
      maxCostRegressionPct,
    }) => {
      const resolved = [];

      for (const pair of pairs) {
        const [baseline, candidate] = await Promise.all([
          getRunDetail(principal.organizationId, pair.baselineRunId),
          getRunDetail(principal.organizationId, pair.candidateRunId),
        ]);

        if (!baseline) return text({ error: "RUN_NOT_FOUND", runId: pair.baselineRunId });
        if (!candidate) return text({ error: "RUN_NOT_FOUND", runId: pair.candidateRunId });

        if (principal.projectId
          && (baseline.run.projectId !== principal.projectId || candidate.run.projectId !== principal.projectId)) {
          return text({ error: "PROJECT_SCOPE_VIOLATION" });
        }

        if (baseline.run.projectId !== candidate.run.projectId) {
          return text({
            error: "PROJECT_PAIR_MISMATCH",
            caseId: pair.caseId,
            baselineProjectId: baseline.run.projectId,
            candidateProjectId: candidate.run.projectId,
          });
        }

        resolved.push({
          caseId: pair.caseId,
          baselineRun: storedRun(baseline.run),
          candidateRun: storedRun(candidate.run),
          baselineOutcome: storedOutcome(baseline.outcome),
          candidateOutcome: storedOutcome(candidate.outcome),
        });
      }

      return text(analyzeReceiptBackedOptimizerPlan({
        id,
        components,
        pairs: resolved,
        minimumSampleSize,
        qualityNonInferiorityMargin,
        minimumQualityScore: minimumQualityScore ?? null,
        maxCostRegressionPct,
      }));
    },
  );

  server.registerTool(
    "analyze_prompt_cache_economics",
    {
      description: "Evaluate provider prompt-cache economics from metadata-only evidence. Cache accounting must be authoritative; cache savings are cost-only and never promoted to raw token savings.",
      inputSchema: promptCacheEconomicsInput,
    },
    async ({ minimumSampleSize, ...candidate }) => text(evaluatePromptCacheEconomics(candidate, { minimumSampleSize })),
  );

  server.registerTool(
    "analyze_budget_control",
    {
      description: "Evaluate hard budget/control-plane economics. Policy bypasses, hard-limit breaches, denied required work and unverified enforcement fail closed; successful results remain cost-only.",
      inputSchema: budgetControlInput,
    },
    async ({ minimumSampleSize, ...candidate }) => text(evaluateBudgetControl(candidate, { minimumSampleSize })),
  );

  server.registerTool(
    "analyze_orchestration_efficiency",
    {
      description: "Evaluate agent/delegation token efficiency while charging coordinator, handoff, retry and fallback overhead. Bounded fanout, authoritative provenance and outcome parity are mandatory.",
      inputSchema: orchestrationEfficiencyInput,
    },
    async ({ minimumSampleSize, ...candidate }) => text(evaluateOrchestrationEfficiency(candidate, { minimumSampleSize })),
  );

  server.registerTool(
    "get_token_saving_capability_coverage",
    {
      description: "Return the clean-room coverage map from every enrolled token-saving donor to the owned Token Intelligence evaluator family. Coverage does not imply donor-specific evidence verification.",
      inputSchema: z.object({}).strict(),
    },
    async () => text(buildCapabilityCoverageReport()),
  );

  return server;
}
