import { and, eq } from "drizzle-orm";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { getDb } from "@/db/client";
import { findings, runs } from "@/db/schema";
import { calculateCost, contextUsage } from "@/lib/cost";
import { MODEL_CATALOG } from "@/lib/models";
import { getOverviewData, getRunDetail } from "@/lib/app-data";
import { evaluateOrganizationPolicy } from "@/lib/policy/evaluate-db";
import { policyCheckSchema } from "@/lib/policy/schemas";
import { ingestTelemetryEvent } from "@/lib/telemetry/ingest";
import { mcpTelemetryEventSchema, parseMcpTelemetryEvent } from "@/lib/telemetry/schemas";

export interface McpPrincipal {
  organizationId: string;
  projectId: string | null;
  serviceAccountId: string | null;
  apiKeyId?: string;
  scopes: string[];
}

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const economicsInput = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative().default(0),
  cachedInputTokens: z.number().int().nonnegative().default(0),
  provider: z.string().optional(),
  modelId: z.string().optional(),
  minimumContext: z.number().int().nonnegative().default(0),
});

function economicRows(input: z.infer<typeof economicsInput>) {
  return MODEL_CATALOG
    .filter((model) => model.status !== "legacy")
    .filter((model) => !input.provider || model.provider.toLowerCase() === input.provider.toLowerCase())
    .filter((model) => !input.modelId || model.id === input.modelId)
    .filter((model) => model.contextWindow >= Math.max(input.minimumContext, input.inputTokens + input.outputTokens))
    .map((model) => {
      const result = calculateCost(model, { inputTokens: input.inputTokens, outputTokens: input.outputTokens, cachedInputTokens: Math.min(input.cachedInputTokens, input.inputTokens) });
      return { modelId: model.id, model: model.name, provider: model.provider, costUsd: result.total, pricingTier: result.pricingTier, contextWindow: model.contextWindow, contextUtilizationPct: contextUsage(input.inputTokens, input.outputTokens, model.contextWindow), tokenPrecision: model.tokenizerAccuracy, pricingVerifiedAt: model.verifiedAt };
    })
    .sort((a, b) => a.costUsd - b.costUsd);
}

function displayRunCost(run: { reconciledCostUsd: string | null; actualCostUsd: string | null; estimatedCostUsd: string | null }) {
  const source = run.reconciledCostUsd !== null ? "reconciled" : run.actualCostUsd !== null ? "provider_or_agent_actual" : run.estimatedCostUsd !== null ? "estimated" : "unknown";
  const raw = run.reconciledCostUsd ?? run.actualCostUsd ?? run.estimatedCostUsd;
  return { valueUsd: raw === null ? null : Number(raw), source };
}

export function createTokenIntelligenceMcpServer(principal: McpPrincipal) {
  const server = new McpServer({ name: "token-intelligence", version: "0.4.0" });

  server.registerTool("estimate_cost", { description: "Estimate current model economics for a known token workload. This is cost/context analysis, not a quality guarantee.", inputSchema: economicsInput }, async (input) => text({ source: "current_pricing_catalog", results: economicRows(input) }));
  server.registerTool("compare_models", { description: "Rank compatible current models by estimated request cost while preserving pricing tier and tokenizer precision labels.", inputSchema: economicsInput }, async (input) => text({ results: economicRows(input), caveat: "Lower estimated cost does not establish equal model quality." }));
  server.registerTool("recommend_model", { description: "Return the lowest-cost compatible model for declared context/provider constraints. Economics only; no unmeasured quality claim.", inputSchema: economicsInput }, async (input) => { const results = economicRows(input); return text(results.length ? { recommendation: results[0], alternatives: results.slice(1, 4), basis: "lowest estimated cost among compatible catalog entries" } : { recommendation: null, reason: "No compatible model in the current catalog." }); });

  server.registerTool("check_context", { description: "Check a token workload against one model context window or all compatible catalog entries.", inputSchema: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative().default(0), modelId: z.string().optional() }) }, async ({ inputTokens, outputTokens, modelId }) => text({ results: MODEL_CATALOG.filter((model) => !modelId || model.id === modelId).map((model) => ({ modelId: model.id, model: model.name, contextWindow: model.contextWindow, requestedTokens: inputTokens + outputTokens, utilizationPct: contextUsage(inputTokens, outputTokens, model.contextWindow), fits: inputTokens + outputTokens <= model.contextWindow })) }));

  server.registerTool("check_budget", { description: "Evaluate configured budgets and policies for a projected operation. Gateway enforcement is authoritative; MCP checks are advisory unless the call itself is routed through the gateway.", inputSchema: policyCheckSchema }, async (input) => {
    if (principal.projectId && input.projectId && input.projectId !== principal.projectId) return text({ error: "PROJECT_SCOPE_VIOLATION" });
    return text(await evaluateOrganizationPolicy(principal.organizationId, { ...input, projectId: principal.projectId ?? input.projectId, apiKeyId: principal.apiKeyId, serviceAccountId: principal.serviceAccountId ?? input.serviceAccountId }, Boolean(input.runId)));
  });

  server.registerTool(
    "record_usage",
    {
      description: "Explicitly ingest one metadata-only Agent Run Receipt event. Datetimes must be ISO-8601 strings. Prompt, message, source-code, raw tool-output and credential fields are rejected by the server privacy boundary.",
      inputSchema: mcpTelemetryEventSchema,
    },
    async (input) => text({
      recorded: true,
      ...(await ingestTelemetryEvent(
        getDb(),
        { organizationId: principal.organizationId, projectId: principal.projectId },
        parseMcpTelemetryEvent(input),
      )),
    }),
  );
  server.registerTool("get_usage", { description: "Return the organization's current 30-day Agent Economics summary from stored receipts.", inputSchema: z.object({}) }, async () => text(await getOverviewData(principal.organizationId)));

  server.registerTool("get_project_spend", { description: "Return known spend and run counts for one project. Unknown prices remain unknown rather than zero.", inputSchema: z.object({ projectId: z.string().min(1) }) }, async ({ projectId }) => {
    if (principal.projectId && principal.projectId !== projectId) return text({ error: "PROJECT_SCOPE_VIOLATION" });
    const owned = await getDb().select().from(runs).where(and(eq(runs.organizationId, principal.organizationId), eq(runs.projectId, projectId)));
    const known = owned.flatMap((run) => { const cost = displayRunCost(run); return cost.valueUsd === null ? [] : [cost.valueUsd]; });
    return text({ projectId, runCount: owned.length, knownCostRunCount: known.length, knownSpendUsd: known.length ? known.reduce((sum, value) => sum + value, 0) : null, unknownCostRunCount: owned.length - known.length });
  });

  server.registerTool("get_run", { description: "Fetch one tenant-scoped Agent Run Receipt with turns, model/tool calls, policy decisions, outcome and findings.", inputSchema: z.object({ runId: z.string().min(1) }) }, async ({ runId }) => {
    const detail = await getRunDetail(principal.organizationId, runId);
    if (!detail) return text({ error: "RUN_NOT_FOUND" });
    if (principal.projectId && detail.run.projectId !== principal.projectId) return text({ error: "PROJECT_SCOPE_VIOLATION" });
    return text(detail);
  });

  server.registerTool("find_savings", { description: "Return explainable findings already computed for tenant-scoped runs. Findings preserve measured-vs-estimated confidence and require outcome verification before claiming savings.", inputSchema: z.object({ runId: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) }) }, async ({ runId, limit }) => {
    if (runId) {
      const detail = await getRunDetail(principal.organizationId, runId);
      if (!detail) return text({ error: "RUN_NOT_FOUND" });
      if (principal.projectId && detail.run.projectId !== principal.projectId) return text({ error: "PROJECT_SCOPE_VIOLATION" });
      return text({ runId, findings: detail.findings.slice(0, limit) });
    }
    const scopedRuns = await getDb().select({ id: runs.id }).from(runs).where(principal.projectId ? and(eq(runs.organizationId, principal.organizationId), eq(runs.projectId, principal.projectId)) : eq(runs.organizationId, principal.organizationId));
    const runIds = new Set(scopedRuns.map((row) => row.id));
    const rows = await getDb().select().from(findings).where(eq(findings.organizationId, principal.organizationId));
    return text({ findings: rows.filter((row) => runIds.has(row.runId)).slice(0, limit) });
  });

  server.registerTool("explain_cost", { description: "Explain the economics of one run without returning prompt/source content. Includes cost provenance, provider-native token classes, retries/fallbacks, findings and outcome evidence.", inputSchema: z.object({ runId: z.string().min(1) }) }, async ({ runId }) => {
    const detail = await getRunDetail(principal.organizationId, runId);
    if (!detail) return text({ error: "RUN_NOT_FOUND" });
    if (principal.projectId && detail.run.projectId !== principal.projectId) return text({ error: "PROJECT_SCOPE_VIOLATION" });
    const cost = displayRunCost(detail.run);
    return text({
      runId,
      cost,
      usageSource: detail.run.usageSource,
      tokens: { freshInput: detail.run.freshInputTokens, cacheRead: detail.run.cacheReadTokens, cacheWrite: detail.run.cacheWriteTokens, reasoning: detail.run.reasoningTokens, output: detail.run.outputTokens },
      retries: detail.run.retryCount,
      fallbacks: detail.run.fallbackCount,
      turns: detail.run.turnCount,
      status: detail.run.status,
      outcome: detail.outcome,
      findings: detail.findings,
      privacy: { contentReturned: false },
    });
  });

  return server;
}
