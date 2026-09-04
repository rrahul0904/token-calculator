import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { projects, savedScenarios, scenarioVersions } from "@/db/schema";
import { requireTenant } from "@/lib/auth/session";
import { assertMetadataOnly } from "@/lib/telemetry/privacy";
import { workloadScenarioSchema } from "@/lib/economics/schemas";
import { resolveScenarioEstimate } from "@/lib/economics/workload";
import { latestPublishedPricingSnapshot } from "@/lib/pricing/refresh";

const scenarioSchema = z.object({
  name: z.string().trim().min(2).max(160),
  projectId: z.string().max(180).nullable().optional(),
  scenario: z.record(z.string(), z.unknown()),
  promptHashA: z.string().max(128).nullable().optional(),
  promptHashB: z.string().max(128).nullable().optional(),
});

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export async function GET() {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const rows = await getDb().select().from(savedScenarios).where(eq(savedScenarios.organizationId, tenant.organizationId)).orderBy(desc(savedScenarios.updatedAt)).limit(100);
    return reply({ data: rows });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403);
  }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("scenarios:write");
    const parsed = scenarioSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    assertMetadataOnly(parsed.data.scenario);
    const db = getDb();

    if (parsed.data.projectId) {
      const project = (await db.select({ id: projects.id, organizationId: projects.organizationId }).from(projects).where(eq(projects.id, parsed.data.projectId)).limit(1))[0];
      if (!project) return reply({ error: "PROJECT_NOT_FOUND" }, 404);
      if (project.organizationId !== tenant.organizationId) return reply({ error: "CROSS_TENANT_REFERENCE" }, 403);
    }

    const workloadCandidate = parsed.data.scenario.workload;
    const workload = workloadScenarioSchema.safeParse(workloadCandidate);
    const result = workload.success ? resolveScenarioEstimate(workload.data) : null;
    const latestPricing = await latestPublishedPricingSnapshot().catch(() => null);

    const row = await db.transaction(async (tx) => {
      const created = (await tx.insert(savedScenarios).values({
        id: "scn_" + randomUUID(),
        organizationId: tenant.organizationId,
        projectId: parsed.data.projectId ?? null,
        createdByUserId: tenant.internalUserId,
        name: parsed.data.name,
        scenario: parsed.data.scenario,
        promptHashA: parsed.data.promptHashA ?? null,
        promptHashB: parsed.data.promptHashB ?? null,
      }).returning())[0];

      await tx.insert(scenarioVersions).values({
        id: "scv_" + randomUUID(),
        scenarioId: created.id,
        version: 1,
        pricingSnapshotId: latestPricing?.id ?? null,
        assumptions: workload.success ? workload.data : parsed.data.scenario,
        result: result ? jsonRecord(result) : {},
      });
      return created;
    });
    return reply({ data: row, version: 1, pricingSnapshotId: latestPricing?.id ?? null }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CREATE_FAILED";
    return reply({ error: message }, message === "CONTENT_RETENTION_DISABLED" ? 400 : 403);
  }
}
