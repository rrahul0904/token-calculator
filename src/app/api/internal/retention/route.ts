import { and, eq, lt } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { retentionPolicies } from "@/db/controls-schema";
import { auditEvents, findings, runs, usageEvents } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function cutoff(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return Response.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  if (!process.env.CRON_SECRET) return Response.json({ error: "RETENTION_CRON_NOT_CONFIGURED" }, { status: 503 });
  if (!authorized(request)) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const db = getDb();
  const policies = await db.select().from(retentionPolicies).where(eq(retentionPolicies.enabled, true));
  const results: Array<Record<string, unknown>> = [];

  for (const policy of policies) {
    const telemetryCutoff = cutoff(policy.telemetryDays);
    const findingCutoff = cutoff(policy.findingDays);
    const runCutoff = cutoff(policy.runDays);
    const auditCutoff = cutoff(policy.auditDays);

    const deletedTelemetry = await db.delete(usageEvents).where(and(eq(usageEvents.organizationId, policy.organizationId), lt(usageEvents.occurredAt, telemetryCutoff))).returning({ id: usageEvents.id });
    const deletedFindings = await db.delete(findings).where(and(eq(findings.organizationId, policy.organizationId), lt(findings.createdAt, findingCutoff))).returning({ id: findings.id });
    // Child turns/calls/tools/outcomes/findings/usage events cascade with the run where foreign keys are present.
    const deletedRuns = await db.delete(runs).where(and(eq(runs.organizationId, policy.organizationId), lt(runs.startedAt, runCutoff))).returning({ id: runs.id });
    const deletedAudit = await db.delete(auditEvents).where(and(eq(auditEvents.organizationId, policy.organizationId), lt(auditEvents.occurredAt, auditCutoff))).returning({ id: auditEvents.id });

    results.push({
      organizationId: policy.organizationId,
      deleted: {
        telemetry: deletedTelemetry.length,
        findings: deletedFindings.length,
        runs: deletedRuns.length,
        auditEvents: deletedAudit.length,
      },
    });
  }

  return Response.json({ data: { organizationsProcessed: results.length, results, executedAt: new Date().toISOString() } }, { headers: { "Cache-Control": "no-store" } });
}
