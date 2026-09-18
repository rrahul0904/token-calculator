import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { experimentResults, experiments, verifiedSavings } from "@/db/gap-closure-schema";
import { requireTenant } from "@/lib/auth/session";
import { evaluateExperimentRows } from "@/lib/evaluations/experiment-evidence";

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function evidenceHash(experiment: typeof experiments.$inferSelect, rows: Array<typeof experimentResults.$inferSelect>) {
  const evidence = {
    experiment: {
      id: experiment.id,
      datasetId: experiment.datasetId,
      status: experiment.status,
      baselineConfig: experiment.baselineConfig,
      candidateConfig: experiment.candidateConfig,
      qualityThreshold: experiment.qualityThreshold,
      maxCostRegressionPct: experiment.maxCostRegressionPct,
    },
    results: [...rows].sort((a, b) => a.id.localeCompare(b.id)).map((row) => ({
      id: row.id,
      variant: row.variant,
      caseId: row.caseId,
      runId: row.runId,
      qualityScore: row.qualityScore,
      costUsd: row.costUsd,
      success: row.success,
      evaluatorResults: row.evaluatorResults,
    })),
  };
  return createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
}

async function experimentAndResults(organizationId: string, experimentId: string) {
  const db = getDb();
  const experiment = (await db.select().from(experiments)
    .where(and(eq(experiments.id, experimentId), eq(experiments.organizationId, organizationId)))
    .limit(1))[0];
  if (!experiment) return null;
  const rows = await db.select().from(experimentResults)
    .where(and(eq(experimentResults.experimentId, experimentId), eq(experimentResults.organizationId, organizationId)));
  return { experiment, rows };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const { id } = await context.params;
    const found = await experimentAndResults(tenant.organizationId, id);
    if (!found) return reply({ error: "EXPERIMENT_NOT_FOUND" }, 404);
    const entries = await getDb().select().from(verifiedSavings)
      .where(and(eq(verifiedSavings.experimentId, id), eq(verifiedSavings.organizationId, tenant.organizationId)))
      .orderBy(desc(verifiedSavings.version));
    return reply({ data: entries });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403);
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("scenarios:write");
    const { id } = await context.params;
    const db = getDb();
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenant.organizationId}), hashtext(${id}))`);
      const experiment = (await tx.select().from(experiments)
        .where(and(eq(experiments.id, id), eq(experiments.organizationId, tenant.organizationId)))
        .limit(1))[0];
      if (!experiment) return { kind: "not_found" as const };
      const rows = await tx.select().from(experimentResults)
        .where(and(eq(experimentResults.experimentId, id), eq(experimentResults.organizationId, tenant.organizationId)));
      const verification = evaluateExperimentRows({
        status: experiment.status,
        rows,
        minimumQualityScore: experiment.qualityThreshold,
        maxCostRegressionPct: experiment.maxCostRegressionPct,
      });
      if (!verification.passed || !verification.savings) return { kind: "rejected" as const, verification };

      const hash = evidenceHash(experiment, rows);
      const existing = (await tx.select().from(verifiedSavings)
        .where(and(
          eq(verifiedSavings.experimentId, id),
          eq(verifiedSavings.organizationId, tenant.organizationId),
          eq(verifiedSavings.evidenceHash, hash),
        )).limit(1))[0];
      if (existing) return { kind: "existing" as const, record: existing };

      const latest = (await tx.select({ version: verifiedSavings.version }).from(verifiedSavings)
        .where(and(eq(verifiedSavings.experimentId, id), eq(verifiedSavings.organizationId, tenant.organizationId)))
        .orderBy(desc(verifiedSavings.version)).limit(1))[0];
      const version = (latest?.version ?? 0) + 1;
      const now = new Date();
      const baseline = verification.baseline;
      const candidate = verification.candidate;
      const value = {
        id: `sv_${randomUUID()}`,
        organizationId: tenant.organizationId,
        experimentId: id,
        version,
        evidenceType: verification.evidenceType,
        evidenceHash: hash,
        baselineMedianCostUsd: baseline.medianCostUsd!.toFixed(8),
        candidateMedianCostUsd: candidate.medianCostUsd!.toFixed(8),
        savingsPerObservationUsd: verification.savings.savingsPerObservationUsd.toFixed(8),
        savingsPct: verification.savings.savingsPct === null ? null : verification.savings.savingsPct.toFixed(6),
        baselineMedianQuality: baseline.medianQuality!.toFixed(4),
        candidateMedianQuality: candidate.medianQuality!.toFixed(4),
        baselineSuccessRate: baseline.successRate!.toFixed(6),
        candidateSuccessRate: candidate.successRate!.toFixed(6),
        baselineSampleSize: baseline.count,
        candidateSampleSize: candidate.count,
        verifiedAt: now,
        metadata: {
          source: "experiment_gate",
          datasetId: experiment.datasetId,
          minimumSampleSize: verification.minimumSampleSize,
          qualityFloor: verification.qualityGate?.qualityFloor ?? null,
          costDeltaPct: verification.qualityGate?.costDeltaPct ?? null,
          resultCount: rows.length,
        },
        createdAt: now,
        updatedAt: now,
      };
      await tx.insert(verifiedSavings).values(value);
      const created = (await tx.select().from(verifiedSavings).where(eq(verifiedSavings.id, value.id)).limit(1))[0];
      return { kind: "created" as const, record: created };
    });

    if (outcome.kind === "not_found") return reply({ error: "EXPERIMENT_NOT_FOUND" }, 404);
    if (outcome.kind === "rejected") return reply({ error: "VERIFIED_SAVINGS_GATE_FAILED", data: outcome.verification }, 409);
    if (outcome.kind === "existing") return reply({ data: outcome.record, created: false });
    return reply({ data: outcome.record, created: true }, 201);
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403);
  }
}
