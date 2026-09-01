import { randomUUID } from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { promptComparisons, savedScenarios } from "@/db/schema";
import { requireTenant } from "@/lib/auth/session";
import { assertMetadataOnly } from "@/lib/telemetry/privacy";

const comparisonSchema = z.object({
  scenarioId: z.string().min(8).max(180).nullable().optional(),
  comparisonScenarioId: z.string().min(8).max(180).nullable().optional(),
  projectId: z.string().max(180).nullable().optional(),
  metrics: z.record(z.string(), z.unknown()),
  outcomeEquivalent: z.boolean().nullable().optional(),
  verificationSource: z.enum(["unverified", "manual", "historically_observed", "experiment_verified"]).default("unverified"),
});

function reply(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }

async function assertScenarioTenant(organizationId: string, ids: Array<string | null | undefined>) {
  for (const id of ids.filter((value): value is string => Boolean(value))) {
    const row = (await getDb().select({ id: savedScenarios.id }).from(savedScenarios).where(and(eq(savedScenarios.id, id), eq(savedScenarios.organizationId, organizationId))).limit(1))[0];
    if (!row) throw new Error("SCENARIO_NOT_FOUND_OR_NOT_AUTHORIZED");
  }
}

export async function GET() {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const rows = await getDb().select().from(promptComparisons).where(eq(promptComparisons.organizationId, tenant.organizationId)).orderBy(desc(promptComparisons.createdAt)).limit(100);
    return reply({ data: rows });
  } catch (error) { return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403); }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("scenarios:write");
    const parsed = comparisonSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    assertMetadataOnly(parsed.data.metrics);
    await assertScenarioTenant(tenant.organizationId, [parsed.data.scenarioId, parsed.data.comparisonScenarioId]);
    const row = (await getDb().insert(promptComparisons).values({
      id: `cmp_${randomUUID()}`,
      organizationId: tenant.organizationId,
      projectId: parsed.data.projectId ?? null,
      scenarioId: parsed.data.scenarioId ?? parsed.data.comparisonScenarioId ?? null,
      metrics: {
        ...parsed.data.metrics,
        comparedScenarioId: parsed.data.comparisonScenarioId ?? null,
        verificationSource: parsed.data.verificationSource,
        contentStored: false,
      },
      outcomeEquivalent: parsed.data.outcomeEquivalent ?? null,
    }).returning())[0];
    return reply({ data: row }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CREATE_FAILED";
    return reply({ error: message }, message === "CONTENT_RETENTION_DISABLED" ? 400 : 403);
  }
}
