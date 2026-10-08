import * as z from "zod/v4";
import { getRunDetail } from "@/lib/app-data";
import {
  createTokenIntelligenceMcpServer as createBaseTokenIntelligenceMcpServer,
  type McpPrincipal,
} from "@/lib/mcp/base-server";
import { analyzeReceiptBackedOptimizerPlan } from "@/lib/optimization/receipt-backed-optimizer-plan";
import type {
  StoredOutcomeReceiptInput,
  StoredRunReceiptInput,
} from "@/lib/optimization/paired-run-evidence";

export type { McpPrincipal } from "@/lib/mcp/base-server";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

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

  return server;
}
