import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  experimentResults,
  experiments,
  verifiedSavings,
  verifiedSavingsRevalidations,
} from "@/db/gap-closure-schema";
import { evaluateExperimentRows } from "@/lib/evaluations/experiment-evidence";

type Database = ReturnType<typeof getDb>;

export function verifiedSavingsEvidenceHash(
  experiment: typeof experiments.$inferSelect,
  rows: Array<typeof experimentResults.$inferSelect>,
) {
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
      economicsSource: row.economicsSource,
      measurementScope: row.measurementScope,
      benchmarkContext: row.benchmarkContext,
      evaluatorResults: row.evaluatorResults,
    })),
  };
  return createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
}

export async function verifyExperimentSavings(
  db: Database,
  organizationId: string,
  experimentId: string,
  source = "experiment_gate",
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${experimentId}))`);
    const experiment = (await tx.select().from(experiments)
      .where(and(eq(experiments.id, experimentId), eq(experiments.organizationId, organizationId)))
      .limit(1))[0];
    if (!experiment) return { kind: "not_found" as const };

    const rows = await tx.select().from(experimentResults)
      .where(and(eq(experimentResults.experimentId, experimentId), eq(experimentResults.organizationId, organizationId)));
    const evidenceHash = verifiedSavingsEvidenceHash(experiment, rows);
    const verification = evaluateExperimentRows({
      status: experiment.status,
      rows,
      minimumQualityScore: experiment.qualityThreshold,
      maxCostRegressionPct: experiment.maxCostRegressionPct,
    });
    if (!verification.passed || !verification.savings) {
      return { kind: "rejected" as const, verification, evidenceHash };
    }

    const existing = (await tx.select().from(verifiedSavings)
      .where(and(
        eq(verifiedSavings.experimentId, experimentId),
        eq(verifiedSavings.organizationId, organizationId),
        eq(verifiedSavings.evidenceHash, evidenceHash),
      )).limit(1))[0];
    if (existing) return { kind: "existing" as const, record: existing, verification, evidenceHash };

    const latest = (await tx.select({ version: verifiedSavings.version }).from(verifiedSavings)
      .where(and(eq(verifiedSavings.experimentId, experimentId), eq(verifiedSavings.organizationId, organizationId)))
      .orderBy(desc(verifiedSavings.version)).limit(1))[0];
    const version = (latest?.version ?? 0) + 1;
    const now = new Date();
    const baseline = verification.baseline;
    const candidate = verification.candidate;
    const value = {
      id: `sv_${randomUUID()}`,
      organizationId,
      experimentId,
      version,
      evidenceType: verification.evidenceType,
      evidenceHash,
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
        source,
        datasetId: experiment.datasetId,
        minimumSampleSize: verification.minimumSampleSize,
        qualityFloor: verification.qualityGate?.qualityFloor ?? null,
        costDeltaPct: verification.qualityGate?.costDeltaPct ?? null,
        resultCount: rows.length,
        pairedCaseCount: verification.benchmarkIntegrity?.pairedCaseCount ?? 0,
        authoritativeFullSessionCount: verification.benchmarkIntegrity?.authoritativeFullSessionCount ?? 0,
        cacheAccountingComplete: verification.benchmarkIntegrity?.cacheAccountingComplete ?? false,
        toolCallAccountingComplete: verification.benchmarkIntegrity?.toolCallAccountingComplete ?? false,
        agentToolUseRate: verification.benchmarkIntegrity?.agentToolUseRate ?? null,
        targetToolAccountingCount: verification.benchmarkIntegrity?.targetToolAccountingCount ?? 0,
        targetToolInvocationRate: verification.benchmarkIntegrity?.targetToolInvocationRate ?? null,
        retrievalDiagnosticsCount: verification.benchmarkIntegrity?.retrievalDiagnosticsCount ?? 0,
        medianRetrievalCoverage: verification.benchmarkIntegrity?.medianRetrievalCoverage ?? null,
        medianRetrievalPrecision: verification.benchmarkIntegrity?.medianRetrievalPrecision ?? null,
        medianFilesServed: verification.benchmarkIntegrity?.medianFilesServed ?? null,
        indexTimeCoverage: verification.benchmarkIntegrity?.indexTimeCoverage ?? null,
      },
      createdAt: now,
      updatedAt: now,
    };
    await tx.insert(verifiedSavings).values(value);
    const created = (await tx.select().from(verifiedSavings).where(eq(verifiedSavings.id, value.id)).limit(1))[0];
    return { kind: "created" as const, record: created, verification, evidenceHash };
  });
}

export async function reverifyExperimentSavings(
  db: Database,
  organizationId: string,
  experimentId: string,
  source = "scheduled_reverification",
) {
  const latest = (await db.select().from(verifiedSavings)
    .where(and(eq(verifiedSavings.organizationId, organizationId), eq(verifiedSavings.experimentId, experimentId)))
    .orderBy(desc(verifiedSavings.version)).limit(1))[0];
  if (!latest) return { kind: "no_verified_savings" as const };

  const verification = await verifyExperimentSavings(db, organizationId, experimentId, source);
  if (verification.kind === "not_found") return verification;

  let status: string;
  let record = latest;
  let evidenceType: string;
  let evidenceHash: string;
  if (verification.kind === "rejected") {
    status = verification.verification.evidenceType === "insufficient_evidence"
      ? "insufficient_evidence"
      : "verification_failed";
    evidenceType = verification.verification.evidenceType;
    evidenceHash = verification.evidenceHash;
  } else {
    record = verification.record;
    evidenceType = verification.record.evidenceType;
    evidenceHash = verification.evidenceHash;
    status = verification.kind === "created"
      ? "verified_new_version"
      : verification.record.id === latest.id
        ? "verified_unchanged"
        : "verified_existing_version";
  }

  const now = new Date();
  const revalidation = {
    id: `svr_${randomUUID()}`,
    organizationId,
    experimentId,
    verifiedSavingsId: record.id,
    status,
    evidenceType,
    currentEvidenceHash: evidenceHash,
    checkedAt: now,
    details: {
      source,
      previousVerifiedSavingsId: latest.id,
      previousVersion: latest.version,
      resultingVerifiedSavingsId: record.id,
      resultingVersion: record.version,
      verificationPassed: verification.kind !== "rejected",
    },
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(verifiedSavingsRevalidations).values(revalidation);
  const saved = (await db.select().from(verifiedSavingsRevalidations)
    .where(eq(verifiedSavingsRevalidations.id, revalidation.id)).limit(1))[0];

  return {
    kind: "revalidated" as const,
    status,
    record,
    revalidation: saved,
    verification: verification.kind === "rejected" ? verification.verification : verification.verification,
  };
}
