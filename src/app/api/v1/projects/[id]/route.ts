import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { auditEvents, projects } from "@/db/schema";
import { requireTenant } from "@/lib/auth/session";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  archived: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required.");

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function scopedProject(id: string, organizationId: string) {
  return (await getDb().select().from(projects).where(and(eq(projects.id, id), eq(projects.organizationId, organizationId))).limit(1))[0] ?? null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const { id } = await context.params;
    const project = await scopedProject(id, tenant.organizationId);
    return project ? reply({ data: project }) : reply({ error: "NOT_FOUND" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AUTHORIZATION_FAILED";
    return reply({ error: message }, message === "FORBIDDEN" ? 403 : 401);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("org:manage");
    const { id } = await context.params;
    const project = await scopedProject(id, tenant.organizationId);
    if (!project) return reply({ error: "NOT_FOUND" }, 404);
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

    const now = new Date();
    const archivedAt = parsed.data.archived === undefined ? project.archivedAt : parsed.data.archived ? now : null;
    const row = (await getDb().update(projects).set({
      name: parsed.data.name ?? project.name,
      description: parsed.data.description === undefined ? project.description : parsed.data.description,
      archivedAt,
      updatedAt: now,
    }).where(and(eq(projects.id, id), eq(projects.organizationId, tenant.organizationId))).returning())[0];

    await getDb().insert(auditEvents).values({
      id: `aud_${randomUUID()}`,
      organizationId: tenant.organizationId,
      actorType: "user",
      actorId: tenant.internalUserId,
      action: parsed.data.archived === true ? "project.archived" : parsed.data.archived === false ? "project.restored" : "project.updated",
      resourceType: "project",
      resourceId: id,
      details: { fields: Object.keys(parsed.data) },
    });
    return reply({ data: row });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPDATE_FAILED";
    return reply({ error: message }, message === "FORBIDDEN" ? 403 : 401);
  }
}
