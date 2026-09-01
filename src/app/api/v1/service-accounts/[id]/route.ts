import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { apiKeys, auditEvents, serviceAccounts } from "@/db/schema";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { getTenantContext, roleCan } from "@/lib/auth/session";

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED" }, 401);
  if (!roleCan(tenant.role, "org:manage")) return reply({ error: "FORBIDDEN" }, 403);
  const { id } = await context.params;
  const db = getDb();
  const rows = await db.select().from(serviceAccounts).where(and(eq(serviceAccounts.id, id), eq(serviceAccounts.organizationId, tenant.organizationId))).limit(1);
  const account = rows[0];
  if (!account) return reply({ error: "NOT_FOUND" }, 404);
  if (account.revokedAt) return reply({ data: { id, revokedAt: account.revokedAt } });
  const revokedAt = new Date();
  await db.transaction(async (tx) => {
    await tx.update(serviceAccounts).set({ revokedAt, updatedAt: revokedAt }).where(and(eq(serviceAccounts.id, id), eq(serviceAccounts.organizationId, tenant.organizationId)));
    await tx.update(apiKeys).set({ revokedAt, updatedAt: revokedAt }).where(and(eq(apiKeys.organizationId, tenant.organizationId), eq(apiKeys.serviceAccountId, id)));
    await tx.insert(auditEvents).values({ id: `aud_${randomUUID()}`, organizationId: tenant.organizationId, actorType: "user", actorId: tenant.internalUserId, action: "service_account.revoked", resourceType: "service_account", resourceId: id, details: { associatedApiKeysRevoked: true } });
  });
  return reply({ data: { id, revokedAt, associatedApiKeysRevoked: true } });
}
