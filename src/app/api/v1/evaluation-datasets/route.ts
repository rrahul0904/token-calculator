import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { projects } from "@/db/schema";
import { evaluationCases, evaluationDatasets } from "@/db/gap-closure-schema";
import { requireTenant } from "@/lib/auth/session";
import { assertMetadataOnly } from "@/lib/telemetry/privacy";

const createSchema = z.object({
  name: z.string().trim().min(2).max(160),
  version: z.string().trim().min(1).max(80).default("1"),
  projectId: z.string().max(180).nullable().optional(),
  contentRetentionMode: z.literal("metadata_only").default("metadata_only"),
});

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const db = getDb();
    const [datasets, cases] = await Promise.all([
      db.select().from(evaluationDatasets)
        .where(eq(evaluationDatasets.organizationId, tenant.organizationId))
        .orderBy(desc(evaluationDatasets.updatedAt))
        .limit(250),
      db.select({ id: evaluationCases.id, datasetId: evaluationCases.datasetId })
        .from(evaluationCases)
        .where(eq(evaluationCases.organizationId, tenant.organizationId)),
    ]);
    const counts = new Map<string, number>();
    for (const row of cases) counts.set(row.datasetId, (counts.get(row.datasetId) ?? 0) + 1);
    return reply({ data: datasets.map((row) => ({ ...row, caseCount: counts.get(row.id) ?? 0 })) });
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
    assertMetadataOnly(parsed.data);
    const db = getDb();

    if (parsed.data.projectId) {
      const project = (await db.select({ organizationId: projects.organizationId })
        .from(projects)
        .where(eq(projects.id, parsed.data.projectId))
        .limit(1))[0];
      if (!project) return reply({ error: "PROJECT_NOT_FOUND" }, 404);
      if (project.organizationId !== tenant.organizationId) return reply({ error: "CROSS_TENANT_REFERENCE" }, 403);
    }

    const row = (await db.insert(evaluationDatasets).values({
      id: `eds_${randomUUID()}`,
      organizationId: tenant.organizationId,
      projectId: parsed.data.projectId ?? null,
      name: parsed.data.name,
      version: parsed.data.version,
      contentRetentionMode: "metadata_only",
    }).returning())[0];

    return reply({ data: { ...row, caseCount: 0 } }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CREATE_FAILED";
    return reply({ error: message }, message === "CONTENT_RETENTION_DISABLED" ? 400 : 403);
  }
}
