import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { evaluationCases, evaluationDatasets } from "@/db/gap-closure-schema";
import { requireTenant } from "@/lib/auth/session";
import { assertMetadataOnly } from "@/lib/telemetry/privacy";

const caseSchema = z.object({
  inputReference: z.string().trim().min(1).max(500),
  expectedOutcome: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function datasetForTenant(id: string, organizationId: string) {
  return (await getDb().select().from(evaluationDatasets)
    .where(and(eq(evaluationDatasets.id, id), eq(evaluationDatasets.organizationId, organizationId)))
    .limit(1))[0] ?? null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const { id } = await context.params;
    const dataset = await datasetForTenant(id, tenant.organizationId);
    if (!dataset) return reply({ error: "DATASET_NOT_FOUND" }, 404);
    const rows = await getDb().select().from(evaluationCases)
      .where(and(eq(evaluationCases.datasetId, id), eq(evaluationCases.organizationId, tenant.organizationId)))
      .orderBy(asc(evaluationCases.createdAt));
    return reply({ data: rows, dataset });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("scenarios:write");
    const { id } = await context.params;
    const dataset = await datasetForTenant(id, tenant.organizationId);
    if (!dataset) return reply({ error: "DATASET_NOT_FOUND" }, 404);
    if (dataset.contentRetentionMode !== "metadata_only") return reply({ error: "UNSUPPORTED_RETENTION_MODE" }, 409);

    const parsed = caseSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    assertMetadataOnly(parsed.data.expectedOutcome);
    assertMetadataOnly(parsed.data.metadata);

    const row = (await getDb().insert(evaluationCases).values({
      id: `evc_${randomUUID()}`,
      organizationId: tenant.organizationId,
      datasetId: id,
      inputReference: parsed.data.inputReference,
      expectedOutcome: parsed.data.expectedOutcome,
      tags: parsed.data.tags,
      metadata: parsed.data.metadata,
    }).returning())[0];
    return reply({ data: row }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CREATE_FAILED";
    return reply({ error: message }, message === "CONTENT_RETENTION_DISABLED" ? 400 : 403);
  }
}
