import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { apiKeys, auditEvents } from "@/db/schema";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { getTenantContext } from "@/lib/auth/session";

function noStore(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return noStore({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return noStore({ error: "UNAUTHENTICATED_OR_NOT_ONBOARDED" }, 401);
  const { id } = await context.params;
  const db = getDb();
  const rows = await db.select().from(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, tenant.organizationId))).limit(1);
  const key = rows[0];
  if (!key) return noStore({ error: "NOT_FOUND" }, 404);
  const canRevoke = tenant.role === "owner" || tenant.role === "admin" || key.createdByUserId === tenant.internalUserId;
  if (!canRevoke) return noStore({ error: "FORBIDDEN" }, 403);
  if (key.revokedAt) return noStore({ data: { id, revokedAt: key.revokedAt } });

  const revokedAt = new Date();
  await db.transaction(async (tx) => {
    await tx.update(apiKeys).set({ revokedAt, updatedAt: revokedAt }).where(eq(apiKeys.id, id));
    await tx.insert(auditEvents).values({
      id: `aud_${randomUUID()}`,
      organizationId: tenant.organizationId,
      actorType: "user",
      actorId: tenant.internalUserId,
      action: "api_key.revoked",
      resourceType: "api_key",
      resourceId: id,
      details: { prefix: key.prefix, lastFour: key.lastFour },
    });
  });
  return noStore({ data: { id, revokedAt } });
}
