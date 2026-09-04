import { and, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { runs, savedScenarios } from "@/db/schema";
import { requireTenant } from "@/lib/auth/session";
import { workloadScenarioSchema } from "@/lib/economics/schemas";
import { resolveScenarioEstimate } from "@/lib/economics/workload";
import { explainRunVariance, type ActualCostSource } from "@/lib/economics/variance";
import { advisoryFromEstimate } from "@/lib/economics/advisory";

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function costOf(run: typeof runs.$inferSelect): { costUsd: number | null; costSource: ActualCostSource } {
  if (run.reconciledCostUsd !== null) return { costUsd: Number(run.reconciledCostUsd), costSource: "reconciled" };
  if (run.actualCostUsd !== null) return { costUsd: Number(run.actualCostUsd), costSource: run.usageSource === "provider_measured" ? "provider_measured" : "agent_measured" };
  if (run.estimatedCostUsd !== null) return { costUsd: Number(run.estimatedCostUsd), costSource: "estimated" };
  return { costUsd: null, costSource: "unknown" };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("runs:read");
    const { id } = await context.params;
    const runId = new URL(request.url).searchParams.get("runId");
    if (!runId) return reply({ error: "RUN_ID_REQUIRED" }, 400);
    const db = getDb();
    const scenario = (await db.select().from(savedScenarios).where(and(eq(savedScenarios.id, id), eq(savedScenarios.organizationId, tenant.organizationId))).limit(1))[0];
    if (!scenario) return reply({ error: "SCENARIO_NOT_FOUND" }, 404);
    const run = (await db.select().from(runs).where(and(eq(runs.id, runId), eq(runs.organizationId, tenant.organizationId))).limit(1))[0];
    if (!run) return reply({ error: "RUN_NOT_FOUND" }, 404);

    const stored = scenario.scenario as Record<string, unknown>;
    const workload = workloadScenarioSchema.safeParse(stored.workload);
    if (!workload.success) return reply({ error: "SCENARIO_HAS_NO_WORKLOAD_BASELINE" }, 422);
    const plan = resolveScenarioEstimate(workload.data);
    if (!plan) return reply({ error: "MODEL_NOT_FOUND" }, 422);

    const cost = costOf(run);
    const variance = explainRunVariance(plan, {
      ...cost,
      freshInputTokens: run.freshInputTokens,
      cacheReadTokens: run.cacheReadTokens,
      cacheWriteTokens: run.cacheWriteTokens,
      reasoningTokens: run.reasoningTokens,
      outputTokens: run.outputTokens,
      retryCount: run.retryCount,
      fallbackCount: run.fallbackCount,
      turnCount: run.turnCount,
    });

    return reply({
      data: {
        scenarioId: scenario.id,
        runId: run.id,
        plan,
        variance,
        advisory: advisoryFromEstimate(workload.data, plan, { projectId: scenario.projectId }),
      },
      enforcement: "advisory_only",
      warning: "Budget/policy/gateway handoff is not auto-enforced until outcome quality is independently verified.",
    });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "VARIANCE_FAILED" }, 403);
  }
}
