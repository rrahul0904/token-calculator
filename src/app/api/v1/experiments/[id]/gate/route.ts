import { and, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { experimentResults, experiments } from "@/db/gap-closure-schema";
import { requireTenant } from "@/lib/auth/session";
import { evaluateExperimentRows } from "@/lib/evaluations/experiment-evidence";

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function withLegacyAliases(variant: { count: number; medianQuality: number | null; medianCostUsd: number | null; successRate: number | null }) {
  return {
    ...variant,
    sampleSize: variant.count,
    qualityScore: variant.medianQuality,
  };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const { id } = await context.params;
    const db = getDb();
    const experiment = (await db.select().from(experiments)
      .where(and(eq(experiments.id, id), eq(experiments.organizationId, tenant.organizationId)))
      .limit(1))[0];
    if (!experiment) return reply({ error: "EXPERIMENT_NOT_FOUND" }, 404);

    const rows = await db.select({
      variant: experimentResults.variant,
      caseId: experimentResults.caseId,
      runId: experimentResults.runId,
      qualityScore: experimentResults.qualityScore,
      costUsd: experimentResults.costUsd,
      success: experimentResults.success,
      economicsSource: experimentResults.economicsSource,
      measurementScope: experimentResults.measurementScope,
      benchmarkContext: experimentResults.benchmarkContext,
    }).from(experimentResults)
      .where(and(eq(experimentResults.experimentId, id), eq(experimentResults.organizationId, tenant.organizationId)));

    const verification = evaluateExperimentRows({
      status: experiment.status,
      rows,
      minimumQualityScore: experiment.qualityThreshold,
      maxCostRegressionPct: experiment.maxCostRegressionPct,
    });
    return reply({
      data: {
        ...verification,
        baseline: withLegacyAliases(verification.baseline),
        candidate: withLegacyAliases(verification.candidate),
      },
    });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403);
  }
}
