import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { retentionPolicies } from "@/db/controls-schema";
import { auditEvents, organizations } from "@/db/schema";
import { getTenantContext, roleCan } from "@/lib/auth/session";

const updateSchema = z.object({
  telemetryDays: z.number().int().min(1).max(3650),
  runDays: z.number().int().min(1).max(3650),
  findingDays: z.number().int().min(1).max(3650),
  auditDays: z.number().int().min(30).max(3650),
  enabled: z.boolean().default(true),
});

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED" }, 401);
  const row = (await getDb().select().from(retentionPolicies).where(eq(retentionPolicies.organizationId, tenant.organizationId)).limit(1))[0];
  return reply({ data: row ?? { organizationId: tenant.organizationId, telemetryDays: 90, runDays: 365, findingDays: 365, auditDays: 730, enabled: true, inheritedDefaults: true } });
}

export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED" }, 401);
  if (!roleCan(tenant.role, "org:manage")) return reply({ error: "FORBIDDEN" }, 403);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

  const db = getDb();
  const existing = (await db.select().from(retentionPolicies).where(eq(retentionPolicies.organizationId, tenant.organizationId)).limit(1))[0];
  const now = new Date();
  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(retentionPolicies).set({ ...parsed.data, updatedAt: now }).where(and(eq(retentionPolicies.id, existing.id), eq(retentionPolicies.organizationId, tenant.organizationId)));
    } else {
      await tx.insert(retentionPolicies).values({ id: `ret_${randomUUID()}`, organizationId: tenant.organizationId, ...parsed.data });
    }
    await tx.update(organizations).set({ retentionDays: parsed.data.telemetryDays, updatedAt: now }).where(eq(organizations.id, tenant.organizationId));
    await tx.insert(auditEvents).values({
      id: `aud_${randomUUID()}`,
      organizationId: tenant.organizationId,
      actorType: "user",
      actorId: tenant.internalUserId,
      action: "retention.updated",
      resourceType: "organization",
      resourceId: tenant.organizationId,
      details: parsed.data,
    });
  });
  return reply({ data: { organizationId: tenant.organizationId, ...parsed.data } });
}
