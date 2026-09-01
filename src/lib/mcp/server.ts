import { and, eq } from "drizzle-orm";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { ApiPrincipal } from "@/lib/auth/api-auth";
import { getDb } from "@/db/client";
import { findings, runs } from "@/db/schema";
import { calculateCost, contextUsage } from "@/lib/cost";
import { MODEL_CATALOG } from "@/lib/models";
import { getOverviewData, getRunDetail } from "@/lib/app-data";
import { evaluateOrganizationPolicy } from "@/lib/policy/evaluate-db";
import { policyCheckSchema } from "@/lib/policy/schemas";
import { ingestTelemetryEvent } from "@/lib/telemetry/ingest";
import { mcpTelemetryEventSchema, parseMcpTelemetryEvent } from "@/lib/telemetry/schemas";

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

export function createTokenIntelligenceMcpServer(principal: ApiPrincipal) {
  const server = new McpServer({ name: "token-intelligence", version: "0.3.0" });

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
    const costs = owned.flatMap((run) => { const value = run.reconciledCostUsd ?? run.actualCostUsd ?? run.estimatedCostUsd; if (value === null) return []; const parsed = Number(value); return Number.isFinite(parsed) ? [parsed] : []; });
    return text({ projectId, runs: owned.length, knownCostRuns: costs.length, spendUsd: costs.length ? costs.reduce((sum, value) => sum + value, 0) : null });
  });

  server.registerTool("get_run", { description: "Return one tenant-scoped Agent Run Receipt including turns, LLM calls, tools, outcomes, policy decisions and findings.", inputSchema: z.object({ runId: z.string().min(1) }) }, async ({ runId }) => {
    const detail = await getRunDetail(principal.organizationId, runId);
    if (!detail) return text({ error: "RUN_NOT_FOUND" });
    if (principal.projectId && detail.run.projectId !== principal.projectId) return text({ error: "PROJECT_SCOPE_VIOLATION" });
    return text(detail);
  });

  server.registerTool("find_savings", { description: "Return deterministic persisted waste findings. Findings include evidence, confidence, a recommended fix and a verification recipe; heuristic waste is not represented as measured.", inputSchema: z.object({ runId: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) }) }, async ({ runId, limit }) => {
    if (runId) {
      const detail = await getRunDetail(principal.organizationId, runId);
      if (!detail) return text({ error: "RUN_NOT_FOUND" });
      if (principal.projectId && detail.run.projectId !== principal.projectId) return text({ error: "PROJECT_SCOPE_VIOLATION" });
      return text({ findings: detail.findings.slice(0, limit) });
    }
    if (principal.projectId) {
      const projectRuns = await getDb().select({ id: runs.id }).from(runs).where(and(eq(runs.organizationId, principal.organizationId), eq(runs.projectId, principal.projectId))).limit(500);
      const allowedRunIds = new Set(projectRuns.map((run) => run.id));
      const rows = await getDb().select().from(findings).where(eq(findings.organizationId, principal.organizationId)).limit(500);
      return text({ findings: rows.filter((row) => allowedRunIds.has(row.runId)).slice(0, limit) });
    }
    return text({ findings: await getDb().select().from(findings).where(eq(findings.organizationId, principal.organizationId)).limit(limit) });
  });

  server.registerTool("explain_cost", { description: "Explain one run's known/estimated cost, token buckets, retries/fallbacks and cost certainty without exposing prompt or source content.", inputSchema: z.object({ runId: z.string().min(1) }) }, async ({ runId }) => {
    const detail = await getRunDetail(principal.organizationId, runId);
    if (!detail) return text({ error: "RUN_NOT_FOUND" });
    if (principal.projectId && detail.run.projectId !== principal.projectId) return text({ error: "PROJECT_SCOPE_VIOLATION" });
    const cost = displayRunCost(detail.run);
    return text({ runId, cost, usageSource: detail.run.usageSource, tokens: { freshInput: detail.run.freshInputTokens, cacheRead: detail.run.cacheReadTokens, cacheWrite: detail.run.cacheWriteTokens, reasoning: detail.run.reasoningTokens, output: detail.run.outputTokens }, retries: detail.run.retryCount, fallbacks: detail.run.fallbackCount, turns: detail.run.turnCount, status: detail.run.status, outcomeStatus: detail.run.outcomeStatus, findings: detail.findings.map((finding) => ({ rule: finding.ruleId, severity: finding.severity, confidence: finding.confidence, estimatedWasteUsd: finding.estimatedWasteUsd })) });
  });

  return server;
}
