import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { savedScenarios } from "@/db/schema";
import { requireTenant } from "@/lib/auth/session";
import { assertMetadataOnly } from "@/lib/telemetry/privacy";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  scenario: z.record(z.string(), z.unknown()).optional(),
  duplicate: z.boolean().optional(),
});

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function getOwnedScenario(organizationId: string, id: string) {
  return (await getDb().select().from(savedScenarios).where(and(eq(savedScenarios.id, id), eq(savedScenarios.organizationId, organizationId))).limit(1))[0] ?? null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const { id } = await context.params;
    const row = await getOwnedScenario(tenant.organizationId, id);
    return row ? reply({ data: row }) : reply({ error: "SCENARIO_NOT_FOUND" }, 404);
  } catch (error) { return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("scenarios:write");
    const { id } = await context.params;
    const existing = await getOwnedScenario(tenant.organizationId, id);
    if (!existing) return reply({ error: "SCENARIO_NOT_FOUND" }, 404);
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    if (parsed.data.scenario) assertMetadataOnly(parsed.data.scenario);

    if (parsed.data.duplicate) {
      const duplicate = (await getDb().insert(savedScenarios).values({
        id: `scn_${randomUUID()}`,
        organizationId: tenant.organizationId,
        projectId: existing.projectId,
        createdByUserId: tenant.internalUserId,
        name: parsed.data.name ?? `${existing.name} copy`,
        scenario: parsed.data.scenario ?? existing.scenario,
        promptHashA: existing.promptHashA,
        promptHashB: existing.promptHashB,
      }).returning())[0];
      return reply({ data: duplicate }, 201);
    }

    const updated = (await getDb().update(savedScenarios).set({
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.scenario ? { scenario: parsed.data.scenario } : {}),
      updatedAt: new Date(),
    }).where(and(eq(savedScenarios.id, id), eq(savedScenarios.organizationId, tenant.organizationId))).returning())[0];
    return reply({ data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPDATE_FAILED";
    return reply({ error: message }, message === "CONTENT_RETENTION_DISABLED" ? 400 : 403);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("scenarios:write");
    const { id } = await context.params;
    const deleted = await getDb().delete(savedScenarios).where(and(eq(savedScenarios.id, id), eq(savedScenarios.organizationId, tenant.organizationId))).returning({ id: savedScenarios.id });
    return deleted[0] ? reply({ deleted: true, id }) : reply({ error: "SCENARIO_NOT_FOUND" }, 404);
  } catch (error) { return reply({ error: error instanceof Error ? error.message : "DELETE_FAILED" }, 403); }
}
