import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { experimentResults, experiments } from "@/db/gap-closure-schema";
import { requireTenant } from "@/lib/auth/session";
import { assertMetadataOnly } from "@/lib/telemetry/privacy";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  status: z.enum(["draft", "running", "completed", "failed", "cancelled"]).optional(),
  baselineConfig: z.record(z.string(), z.unknown()).optional(),
  candidateConfig: z.record(z.string(), z.unknown()).optional(),
  qualityThreshold: z.number().min(0).max(1).nullable().optional(),
  maxCostRegressionPct: z.number().min(-100).max(1000).nullable().optional(),
});

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function experimentForTenant(id: string, organizationId: string) {
  return (await getDb().select().from(experiments)
    .where(and(eq(experiments.id, id), eq(experiments.organizationId, organizationId)))
    .limit(1))[0] ?? null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const { id } = await context.params;
    const experiment = await experimentForTenant(id, tenant.organizationId);
    if (!experiment) return reply({ error: "EXPERIMENT_NOT_FOUND" }, 404);
    const results = await getDb().select().from(experimentResults)
      .where(and(eq(experimentResults.experimentId, id), eq(experimentResults.organizationId, tenant.organizationId)));
    return reply({ data: { ...experiment, results } });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("scenarios:write");
    const { id } = await context.params;
    const existing = await experimentForTenant(id, tenant.organizationId);
    if (!existing) return reply({ error: "EXPERIMENT_NOT_FOUND" }, 404);
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    if (parsed.data.baselineConfig) assertMetadataOnly(parsed.data.baselineConfig);
    if (parsed.data.candidateConfig) assertMetadataOnly(parsed.data.candidateConfig);
    if (Object.keys(parsed.data).length === 0) return reply({ error: "NO_CHANGES" }, 400);

    const row = (await getDb().update(experiments).set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.baselineConfig !== undefined ? { baselineConfig: parsed.data.baselineConfig } : {}),
      ...(parsed.data.candidateConfig !== undefined ? { candidateConfig: parsed.data.candidateConfig } : {}),
      ...(parsed.data.qualityThreshold !== undefined ? { qualityThreshold: parsed.data.qualityThreshold === null ? null : String(parsed.data.qualityThreshold) } : {}),
      ...(parsed.data.maxCostRegressionPct !== undefined ? { maxCostRegressionPct: parsed.data.maxCostRegressionPct === null ? null : String(parsed.data.maxCostRegressionPct) } : {}),
      updatedAt: new Date(),
    }).where(and(eq(experiments.id, id), eq(experiments.organizationId, tenant.organizationId))).returning())[0];
    return reply({ data: row });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPDATE_FAILED";
    return reply({ error: message }, message === "CONTENT_RETENTION_DISABLED" ? 400 : 403);
  }
}
