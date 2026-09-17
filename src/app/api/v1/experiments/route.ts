import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { projects } from "@/db/schema";
import { evaluationDatasets, experimentResults, experiments } from "@/db/gap-closure-schema";
import { requireTenant } from "@/lib/auth/session";
import { assertMetadataOnly } from "@/lib/telemetry/privacy";

const createSchema = z.object({
  name: z.string().trim().min(2).max(160),
  datasetId: z.string().min(1).max(180),
  projectId: z.string().max(180).nullable().optional(),
  baselineConfig: z.record(z.string(), z.unknown()),
  candidateConfig: z.record(z.string(), z.unknown()),
  qualityThreshold: z.number().min(0).max(1).nullable().optional(),
  maxCostRegressionPct: z.number().min(-100).max(1000).nullable().optional(),
});

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const db = getDb();
    const [rows, results] = await Promise.all([
      db.select().from(experiments)
        .where(eq(experiments.organizationId, tenant.organizationId))
        .orderBy(desc(experiments.updatedAt))
        .limit(250),
      db.select({ id: experimentResults.id, experimentId: experimentResults.experimentId })
        .from(experimentResults)
        .where(eq(experimentResults.organizationId, tenant.organizationId)),
    ]);
    const counts = new Map<string, number>();
    for (const row of results) counts.set(row.experimentId, (counts.get(row.experimentId) ?? 0) + 1);
    return reply({ data: rows.map((row) => ({ ...row, resultCount: counts.get(row.id) ?? 0 })) });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403);
  }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("scenarios:write");
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    assertMetadataOnly(parsed.data.baselineConfig);
    assertMetadataOnly(parsed.data.candidateConfig);

    const db = getDb();
    const dataset = (await db.select({ id: evaluationDatasets.id, organizationId: evaluationDatasets.organizationId })
      .from(evaluationDatasets)
      .where(eq(evaluationDatasets.id, parsed.data.datasetId))
      .limit(1))[0];
    if (!dataset) return reply({ error: "DATASET_NOT_FOUND" }, 404);
    if (dataset.organizationId !== tenant.organizationId) return reply({ error: "CROSS_TENANT_REFERENCE" }, 403);

    if (parsed.data.projectId) {
      const project = (await db.select({ organizationId: projects.organizationId })
        .from(projects)
        .where(eq(projects.id, parsed.data.projectId))
        .limit(1))[0];
      if (!project) return reply({ error: "PROJECT_NOT_FOUND" }, 404);
      if (project.organizationId !== tenant.organizationId) return reply({ error: "CROSS_TENANT_REFERENCE" }, 403);
    }

    const row = (await db.insert(experiments).values({
      id: `exp_${randomUUID()}`,
      organizationId: tenant.organizationId,
      projectId: parsed.data.projectId ?? null,
      datasetId: parsed.data.datasetId,
      name: parsed.data.name,
      status: "draft",
      baselineConfig: parsed.data.baselineConfig,
      candidateConfig: parsed.data.candidateConfig,
      qualityThreshold: parsed.data.qualityThreshold === null || parsed.data.qualityThreshold === undefined ? null : String(parsed.data.qualityThreshold),
      maxCostRegressionPct: parsed.data.maxCostRegressionPct === null || parsed.data.maxCostRegressionPct === undefined ? null : String(parsed.data.maxCostRegressionPct),
    }).returning())[0];

    return reply({ data: { ...row, resultCount: 0 } }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CREATE_FAILED";
    return reply({ error: message }, message === "CONTENT_RETENTION_DISABLED" ? 400 : 403);
  }
}
