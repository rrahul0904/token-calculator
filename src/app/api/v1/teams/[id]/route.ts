import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { teams } from "@/db/gap-closure-schema";
import { requireTenant } from "@/lib/auth/session";

const updateSchema = z.object({ name: z.string().trim().min(2).max(120).optional(), costCenter: z.string().trim().max(160).nullable().optional(), archived: z.boolean().optional() });
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("org:manage");
    const { id } = await context.params;
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    const updated = (await getDb().update(teams).set({
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.costCenter !== undefined ? { costCenter: parsed.data.costCenter } : {}),
      ...(parsed.data.archived !== undefined ? { archivedAt: parsed.data.archived ? new Date() : null } : {}),
      updatedAt: new Date(),
    }).where(and(eq(teams.id, id), eq(teams.organizationId, tenant.organizationId))).returning())[0];
    return updated ? reply({ data: updated }) : reply({ error: "TEAM_NOT_FOUND" }, 404);
  } catch (error) { return reply({ error: error instanceof Error ? error.message : "UPDATE_FAILED" }, 403); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("org:manage");
    const { id } = await context.params;
    const deleted = await getDb().delete(teams).where(and(eq(teams.id, id), eq(teams.organizationId, tenant.organizationId))).returning({ id: teams.id });
    return deleted[0] ? reply({ deleted: true, id }) : reply({ error: "TEAM_NOT_FOUND" }, 404);
  } catch (error) { return reply({ error: error instanceof Error ? error.message : "DELETE_FAILED" }, 403); }
}
