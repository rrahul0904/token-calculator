import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { llmCalls, runs } from "@/db/schema";
import { evaluationCases, experimentResults, experiments } from "@/db/gap-closure-schema";
import { requireTenant } from "@/lib/auth/session";
import { evaluateSuite, type EvaluatorSpec } from "@/lib/evaluations/engine";
import { resolveExperimentEconomics, resolveOrchestrationExperimentEconomics, type LinkedRunEconomics } from "@/lib/evaluations/run-economics";
import { assertMetadataOnly } from "@/lib/telemetry/privacy";

const evaluatorSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string().min(1).max(120), kind: z.literal("json_schema"), requiredKeys: z.array(z.string().min(1).max(120)).max(100) }),
  z.object({ id: z.string().min(1).max(120), kind: z.literal("tests_passed"), required: z.boolean() }),
  z.object({ id: z.string().min(1).max(120), kind: z.literal("expected_tool"), tool: z.string().min(1).max(180) }),
  z.object({ id: z.string().min(1).max(120), kind: z.literal("required_artifact"), artifactType: z.string().min(1).max(180) }),
  z.object({ id: z.string().min(1).max(120), kind: z.literal("ci_result"), required: z.boolean() }),
  z.object({ id: z.string().min(1).max(120), kind: z.literal("custom_boolean"), key: z.string().min(1).max(120), expected: z.boolean() }),
  z.object({ id: z.string().min(1).max(120), kind: z.literal("custom_numeric"), key: z.string().min(1).max(120), operator: z.enum([">=", ">", "<=", "<", "=="]), threshold: z.number().finite() }),
]);

const observationSchema = z.object({
  outputJson: z.unknown().optional(),
  testsPassed: z.boolean().nullable().optional(),
  toolsInvoked: z.array(z.string().max(180)).max(200).optional(),
  artifacts: z.array(z.object({ type: z.string().max(180), reference: z.string().max(500).nullable().optional() })).max(200).optional(),
  ciPassed: z.boolean().nullable().optional(),
  custom: z.record(z.string(), z.union([z.boolean(), z.number().finite(), z.null()])).optional(),
});

const resultSchema = z.object({
  variant: z.enum(["baseline", "candidate"]),
  caseId: z.string().max(180).nullable().optional(),
  runId: z.string().max(180).nullable().optional(),
  qualityScore: z.number().min(0).max(1).nullable().optional(),
  costUsd: z.number().min(0).nullable().optional(),
  tokens: z.number().int().min(0).nullable().optional(),
  latencyMs: z.number().int().min(0).nullable().optional(),
  retries: z.number().int().min(0).max(10000).default(0),
  fallbacks: z.number().int().min(0).max(10000).default(0),
  success: z.boolean().nullable().optional(),
  evaluatorSpecs: z.array(evaluatorSchema).max(100).optional(),
  observation: observationSchema.optional(),
}).superRefine((value, ctx) => {
  if ((value.evaluatorSpecs?.length ?? 0) > 0 && !value.observation) {
    ctx.addIssue({ code: "custom", path: ["observation"], message: "observation is required when evaluatorSpecs are supplied" });
  }
});

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function experimentForTenant(id: string, organizationId: string) {
  return (await getDb().select().from(experiments)
    .where(and(eq(experiments.id, id), eq(experiments.organizationId, organizationId)))
    .limit(1))[0] ?? null;
}

function metadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isTerminalRun(run: { status: string; endedAt: Date | null }) {
  return ["completed", "failed", "aborted", "cancelled", "budget_blocked"].includes(run.status.trim().toLowerCase())
    && run.endedAt instanceof Date
    && Number.isFinite(run.endedAt.getTime());
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const { id } = await context.params;
    const experiment = await experimentForTenant(id, tenant.organizationId);
    if (!experiment) return reply({ error: "EXPERIMENT_NOT_FOUND" }, 404);
    const rows = await getDb().select().from(experimentResults)
      .where(and(eq(experimentResults.experimentId, id), eq(experimentResults.organizationId, tenant.organizationId)))
      .orderBy(asc(experimentResults.createdAt));
    return reply({ data: rows });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("scenarios:write");
    const { id } = await context.params;
    const experiment = await experimentForTenant(id, tenant.organizationId);
    if (!experiment) return reply({ error: "EXPERIMENT_NOT_FOUND" }, 404);
    const parsed = resultSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    const db = getDb();

    if (parsed.data.caseId) {
      const caseRow = (await db.select({ organizationId: evaluationCases.organizationId, datasetId: evaluationCases.datasetId })
        .from(evaluationCases).where(eq(evaluationCases.id, parsed.data.caseId)).limit(1))[0];
      if (!caseRow) return reply({ error: "CASE_NOT_FOUND" }, 404);
      if (caseRow.organizationId !== tenant.organizationId || caseRow.datasetId !== experiment.datasetId) return reply({ error: "CROSS_TENANT_OR_DATASET_REFERENCE" }, 403);
    }
    let linkedRun: (LinkedRunEconomics & { organizationId: string; metadata: Record<string, unknown>; toolCallCount: number; status: string; endedAt: Date | null }) | null = null;
    if (parsed.data.runId) {
      const run = (await db.select({
        organizationId: runs.organizationId,
        reconciledCostUsd: runs.reconciledCostUsd,
        actualCostUsd: runs.actualCostUsd,
        usageSource: runs.usageSource,
        agentVendor: runs.agentVendor,
        freshInputTokens: runs.freshInputTokens,
        cacheReadTokens: runs.cacheReadTokens,
        cacheWriteTokens: runs.cacheWriteTokens,
        reasoningTokens: runs.reasoningTokens,
        outputTokens: runs.outputTokens,
        toolCallCount: runs.toolCallCount,
        retryCount: runs.retryCount,
        fallbackCount: runs.fallbackCount,
        status: runs.status,
        endedAt: runs.endedAt,
        metadata: runs.metadata,
      }).from(runs).where(eq(runs.id, parsed.data.runId)).limit(1))[0];
      if (!run) return reply({ error: "RUN_NOT_FOUND" }, 404);
      if (run.organizationId !== tenant.organizationId) return reply({ error: "CROSS_TENANT_REFERENCE" }, 403);
      linkedRun = run;
    }

    let qualityScore = parsed.data.qualityScore ?? null;
    let success = parsed.data.success ?? null;
    let evaluatorResults: Array<Record<string, unknown>> = [];
    if ((parsed.data.evaluatorSpecs?.length ?? 0) > 0 && parsed.data.observation) {
      assertMetadataOnly(parsed.data.observation);
      const evaluated = evaluateSuite(parsed.data.evaluatorSpecs as EvaluatorSpec[], parsed.data.observation);
      qualityScore = evaluated.qualityScore;
      success = evaluated.passed;
      evaluatorResults = evaluated.results.map((result) => ({ ...result }));
    }

    const orchestrationRunId = linkedRun && typeof linkedRun.metadata["orchestration.run_id"] === "string"
      ? linkedRun.metadata["orchestration.run_id"].trim()
      : "";
    let economics;
    let measurementScope = linkedRun ? (isTerminalRun(linkedRun) ? "full_session" : "incomplete_session") : "submitted_observation";
    let benchmarkContext: Record<string, unknown> = {
      benchmark_version: "full-session-v1",
      measurement_scope: measurementScope,
    };
    if (linkedRun && orchestrationRunId) {
      const [orchestrationCalls, orchestrationRuns] = await Promise.all([
        db.select({
          provider: llmCalls.provider,
          costUsd: llmCalls.costUsd,
          costSource: llmCalls.costSource,
          freshInputTokens: llmCalls.freshInputTokens,
          cacheReadTokens: llmCalls.cacheReadTokens,
          cacheWriteTokens: llmCalls.cacheWriteTokens,
          reasoningTokens: llmCalls.reasoningTokens,
          outputTokens: llmCalls.outputTokens,
        }).from(llmCalls).where(and(
          eq(llmCalls.organizationId, tenant.organizationId),
          sql`${llmCalls.metadata} ->> 'orchestration.run_id' = ${orchestrationRunId}`,
        )),
        db.select({
          retryCount: runs.retryCount,
          fallbackCount: runs.fallbackCount,
          cacheReadTokens: runs.cacheReadTokens,
          cacheWriteTokens: runs.cacheWriteTokens,
          toolCallCount: runs.toolCallCount,
          turnCount: runs.turnCount,
          status: runs.status,
          endedAt: runs.endedAt,
          metadata: runs.metadata,
        }).from(runs).where(and(
          eq(runs.organizationId, tenant.organizationId),
          sql`${runs.metadata} ->> 'orchestration.run_id' = ${orchestrationRunId}`,
        )),
      ]);
      const completeOrchestration = orchestrationRuns.length > 0
        && isTerminalRun(linkedRun)
        && orchestrationRuns.every(isTerminalRun);
      economics = resolveOrchestrationExperimentEconomics({
        calls: orchestrationCalls,
        retries: orchestrationRuns.reduce((sum, run) => sum + (run.retryCount ?? 0), 0),
        fallbacks: orchestrationRuns.reduce((sum, run) => sum + (run.fallbackCount ?? 0), 0),
      });
      measurementScope = completeOrchestration ? "orchestration_full_session" : "incomplete_session";
      const indexTimes = orchestrationRuns.map((run) => metadataNumber(run.metadata, "benchmark.index_time_ms"));
      const targetToolCounts = orchestrationRuns.map((run) => metadataNumber(run.metadata, "benchmark.target_tool_call_count"));
      benchmarkContext = {
        benchmark_version: "full-session-v1",
        measurement_scope: measurementScope,
        run_status: linkedRun.status,
        run_ended_at: linkedRun.endedAt?.toISOString() ?? null,
        session_runs_terminal: completeOrchestration,
        target_tool: metadataString(linkedRun.metadata, "benchmark.target_tool"),
        fresh_input_tokens: orchestrationCalls.reduce((sum, call) => sum + (call.freshInputTokens ?? 0), 0),
        cache_read_tokens: orchestrationCalls.length > 0 && orchestrationCalls.every((call) => call.cacheReadTokens !== null)
          ? orchestrationCalls.reduce((sum, call) => sum + call.cacheReadTokens!, 0)
          : null,
        cache_write_tokens: orchestrationCalls.length > 0 && orchestrationCalls.every((call) => call.cacheWriteTokens !== null)
          ? orchestrationCalls.reduce((sum, call) => sum + call.cacheWriteTokens!, 0)
          : null,
        reasoning_tokens: orchestrationCalls.reduce((sum, call) => sum + (call.reasoningTokens ?? 0), 0),
        output_tokens: orchestrationCalls.reduce((sum, call) => sum + (call.outputTokens ?? 0), 0),
        measured_tokens: economics.tokens,
        tool_call_count: orchestrationRuns.reduce((sum, run) => sum + run.toolCallCount, 0),
        target_tool_call_count: targetToolCounts.length > 0 && targetToolCounts.every((value) => value !== null)
          ? targetToolCounts.reduce<number>((sum, value) => sum + value!, 0)
          : null,
        turn_count: orchestrationRuns.reduce((sum, run) => sum + run.turnCount, 0),
        index_time_ms: indexTimes.length > 0 && indexTimes.every((value) => value !== null)
          ? indexTimes.reduce<number>((sum, value) => sum + value!, 0)
          : null,
        orchestration_run_id: orchestrationRunId,
      };
    } else {
      economics = resolveExperimentEconomics({
        run: linkedRun,
        submitted: {
          costUsd: parsed.data.costUsd ?? null,
          tokens: parsed.data.tokens ?? null,
          retries: parsed.data.retries,
          fallbacks: parsed.data.fallbacks,
        },
      });
      measurementScope = linkedRun ? (isTerminalRun(linkedRun) ? "full_session" : "incomplete_session") : "submitted_observation";
      benchmarkContext = linkedRun ? {
        benchmark_version: "full-session-v1",
        measurement_scope: measurementScope,
        run_status: linkedRun.status,
        run_ended_at: linkedRun.endedAt?.toISOString() ?? null,
        session_runs_terminal: isTerminalRun(linkedRun),
        harness: linkedRun.metadata.agent_name ?? null,
        repository: linkedRun.metadata.repository ?? null,
        repository_commit_sha: linkedRun.metadata.repository_commit_sha ?? null,
        fresh_input_tokens: linkedRun.freshInputTokens,
        cache_read_tokens: linkedRun.cacheReadTokens,
        cache_write_tokens: linkedRun.cacheWriteTokens,
        reasoning_tokens: linkedRun.reasoningTokens,
        output_tokens: linkedRun.outputTokens,
        measured_tokens: economics.tokens,
        tool_call_count: linkedRun.toolCallCount,
        target_tool: metadataString(linkedRun.metadata, "benchmark.target_tool"),
        target_tool_call_count: metadataNumber(linkedRun.metadata, "benchmark.target_tool_call_count"),
        turn_count: metadataNumber(linkedRun.metadata, "benchmark.turn_count"),
        index_time_ms: metadataNumber(linkedRun.metadata, "benchmark.index_time_ms"),
        gold_files_total: metadataNumber(linkedRun.metadata, "benchmark.gold_files_total"),
        gold_files_found: metadataNumber(linkedRun.metadata, "benchmark.gold_files_found"),
        files_served: metadataNumber(linkedRun.metadata, "benchmark.files_served"),
      } : {
        benchmark_version: "full-session-v1",
        measurement_scope: measurementScope,
        note: "Submitted economics are retained as observations and cannot qualify as verified savings.",
      };
    }
    benchmarkContext.economics_source = economics.source;

    const row = (await db.insert(experimentResults).values({
      id: `exr_${randomUUID()}`,
      organizationId: tenant.organizationId,
      experimentId: id,
      variant: parsed.data.variant,
      caseId: parsed.data.caseId ?? null,
      runId: parsed.data.runId ?? null,
      qualityScore: qualityScore === null ? null : String(qualityScore),
      costUsd: economics.costUsd === null ? null : String(economics.costUsd),
      tokens: economics.tokens,
      latencyMs: parsed.data.latencyMs ?? null,
      retries: economics.retries,
      fallbacks: economics.fallbacks,
      economicsSource: economics.source,
      measurementScope,
      benchmarkContext,
      success,
      evaluatorResults,
    }).returning())[0];

    if (experiment.status === "draft") {
      await db.update(experiments).set({ status: "running", updatedAt: new Date() }).where(eq(experiments.id, id));
    }
    return reply({ data: row }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CREATE_FAILED";
    return reply({ error: message }, message === "CONTENT_RETENTION_DISABLED" ? 400 : 403);
  }
}
