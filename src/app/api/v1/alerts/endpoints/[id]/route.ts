import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { auditEvents } from "@/db/schema";
import { alertEndpoints } from "@/db/controls-schema";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { getTenantContext, roleCan } from "@/lib/auth/session";

const patchSchema = z.object({ enabled: z.boolean() });
function reply(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }

async function load(id: string, organizationId: string) {
  return (await getDb().select().from(alertEndpoints).where(and(eq(alertEndpoints.id, id), eq(alertEndpoints.organizationId, organizationId))).limit(1))[0] ?? null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED" }, 401);
  if (!roleCan(tenant.role, "integrations:manage")) return reply({ error: "FORBIDDEN" }, 403);
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  const { id } = await context.params;
  const endpoint = await load(id, tenant.organizationId);
  if (!endpoint) return reply({ error: "NOT_FOUND" }, 404);
  const now = new Date();
  await getDb().transaction(async (tx) => {
    await tx.update(alertEndpoints).set({ enabled: parsed.data.enabled, updatedAt: now }).where(and(eq(alertEndpoints.id, id), eq(alertEndpoints.organizationId, tenant.organizationId)));
    await tx.insert(auditEvents).values({ id: `aud_${randomUUID()}`, organizationId: tenant.organizationId, actorType: "user", actorId: tenant.internalUserId, action: parsed.data.enabled ? "alert_endpoint.enabled" : "alert_endpoint.disabled", resourceType: "alert_endpoint", resourceId: id, details: {} });
  });
  return reply({ data: { id, enabled: parsed.data.enabled } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED" }, 401);
  if (!roleCan(tenant.role, "integrations:manage")) return reply({ error: "FORBIDDEN" }, 403);
  const { id } = await context.params;
  const endpoint = await load(id, tenant.organizationId);
  if (!endpoint) return reply({ error: "NOT_FOUND" }, 404);
  await getDb().transaction(async (tx) => {
    await tx.delete(alertEndpoints).where(and(eq(alertEndpoints.id, id), eq(alertEndpoints.organizationId, tenant.organizationId)));
    await tx.insert(auditEvents).values({ id: `aud_${randomUUID()}`, organizationId: tenant.organizationId, actorType: "user", actorId: tenant.internalUserId, action: "alert_endpoint.deleted", resourceType: "alert_endpoint", resourceId: id, details: { name: endpoint.name } });
  });
  return reply({ data: { id, deleted: true } });
}
