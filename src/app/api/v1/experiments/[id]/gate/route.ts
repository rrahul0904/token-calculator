import { and, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { experimentResults, experiments } from "@/db/gap-closure-schema";
import { requireTenant } from "@/lib/auth/session";
import { evaluateRegressionGate } from "@/lib/evaluations/engine";
import { MINIMUM_EXPERIMENT_EVIDENCE_SAMPLE } from "@/lib/evaluations/experiment-evidence";

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function number(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize(variant: "baseline" | "candidate", rows: typeof experimentResults.$inferSelect[]) {
  const selected = rows.filter((row) => row.variant === variant);
  const qualities = selected.flatMap((row) => {
    const value = number(row.qualityScore);
    return value === null ? [] : [value];
  });
  const costs = selected.flatMap((row) => {
    const value = number(row.costUsd);
    return value === null ? [] : [value];
  });
  const observedSuccess = selected.filter((row) => row.success !== null);
  return {
    variant,
    sampleSize: selected.length,
    qualityScore: median(qualities),
    medianCostUsd: median(costs),
    successRate: observedSuccess.length ? observedSuccess.filter((row) => row.success).length / observedSuccess.length : null,
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

    const rows = await db.select().from(experimentResults)
      .where(and(eq(experimentResults.experimentId, id), eq(experimentResults.organizationId, tenant.organizationId)));
    const baseline = summarize("baseline", rows);
    const candidate = summarize("candidate", rows);
    const minimumQuality = number(experiment.qualityThreshold);
    const configuredMaxCostRegression = number(experiment.maxCostRegressionPct) ?? 0;

    const prerequisites = {
      experimentCompleted: ["completed", "verified"].includes(experiment.status.toLowerCase()),
      baselineSample: baseline.sampleSize >= MINIMUM_EXPERIMENT_EVIDENCE_SAMPLE,
      candidateSample: candidate.sampleSize >= MINIMUM_EXPERIMENT_EVIDENCE_SAMPLE,
      baselineQuality: baseline.qualityScore !== null,
      candidateQuality: candidate.qualityScore !== null,
      baselineCost: baseline.medianCostUsd !== null,
      candidateCost: candidate.medianCostUsd !== null,
      baselineSuccess: baseline.successRate !== null,
      candidateSuccess: candidate.successRate !== null,
    };

    if (!Object.values(prerequisites).every(Boolean)) {
      return reply({
        data: {
          passed: false,
          evidenceType: "insufficient_evidence",
          prerequisites,
          minimumSampleSize: MINIMUM_EXPERIMENT_EVIDENCE_SAMPLE,
          baseline,
          candidate,
        },
      });
    }

    const qualityGate = evaluateRegressionGate({
      baseline: {
        variant: "baseline",
        qualityScore: baseline.qualityScore!,
        successRate: baseline.successRate!,
        medianCostUsd: baseline.medianCostUsd!,
        sampleSize: baseline.sampleSize,
      },
      candidate: {
        variant: "candidate",
        qualityScore: candidate.qualityScore!,
        successRate: candidate.successRate!,
        medianCostUsd: candidate.medianCostUsd!,
        sampleSize: candidate.sampleSize,
      },
      minimumQualityScore: minimumQuality ?? undefined,
      maxCostRegressionPct: configuredMaxCostRegression,
    });
    const successPassed = candidate.successRate! >= baseline.successRate!;
    const costImproved = candidate.medianCostUsd! < baseline.medianCostUsd!;
    const passed = qualityGate.passed && successPassed && costImproved;

    return reply({
      data: {
        ...qualityGate,
        passed,
        successPassed,
        costImproved,
        evidenceType: passed ? "experiment_verified" : "experiment_rejected",
        prerequisites,
        minimumSampleSize: MINIMUM_EXPERIMENT_EVIDENCE_SAMPLE,
      },
    });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403);
  }
}
