import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { apiKeyQuotas } from "@/db/controls-schema";
import { apiKeys, auditEvents } from "@/db/schema";
import { getTenantContext } from "@/lib/auth/session";
import { generateApiKey } from "@/lib/security/api-keys";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rotate") }),
  z.object({
    action: z.literal("quota"),
    requestsPerMinute: z.number().int().min(1).max(10_000),
    monthlyTokenLimit: z.number().int().positive().nullable().optional(),
    monthlyCostLimitUsd: z.number().positive().max(1_000_000).nullable().optional(),
    enabled: z.boolean().default(true),
  }),
]);

function noStore(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function loadScopedKey(id: string, organizationId: string) {
  return (await getDb().select().from(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, organizationId))).limit(1))[0] ?? null;
}

function canManageKey(tenant: { role: string; internalUserId: string }, key: { createdByUserId: string | null }) {
  return tenant.role === "owner" || tenant.role === "admin" || key.createdByUserId === tenant.internalUserId;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return noStore({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return noStore({ error: "UNAUTHENTICATED_OR_NOT_ONBOARDED" }, 401);
  const { id } = await context.params;
  const key = await loadScopedKey(id, tenant.organizationId);
  if (!key) return noStore({ error: "NOT_FOUND" }, 404);
  if (!canManageKey(tenant, key)) return noStore({ error: "FORBIDDEN" }, 403);
  if (key.revokedAt) return noStore({ error: "KEY_REVOKED" }, 409);
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

  const db = getDb();
  if (parsed.data.action === "rotate") {
    const material = generateApiKey(key.environment === "test" ? "test" : "live");
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(apiKeys).set({
        prefix: material.prefix,
        lastFour: material.lastFour,
        secretHash: material.hash,
        lastUsedAt: null,
        updatedAt: now,
      }).where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, tenant.organizationId)));
      await tx.insert(auditEvents).values({
        id: `aud_${randomUUID()}`,
        organizationId: tenant.organizationId,
        actorType: "user",
        actorId: tenant.internalUserId,
        action: "api_key.rotated",
        resourceType: "api_key",
        resourceId: id,
        details: { oldPrefix: key.prefix, newPrefix: material.prefix },
      });
    });
    return noStore({ data: { id, secret: material.secret, prefix: material.prefix, lastFour: material.lastFour, warning: "The old secret is invalid immediately. This replacement secret is shown once." } });
  }

  const quota = (await db.select().from(apiKeyQuotas).where(and(eq(apiKeyQuotas.organizationId, tenant.organizationId), eq(apiKeyQuotas.apiKeyId, id))).limit(1))[0];
  const values = {
    organizationId: tenant.organizationId,
    apiKeyId: id,
    requestsPerMinute: parsed.data.requestsPerMinute,
    monthlyTokenLimit: parsed.data.monthlyTokenLimit ?? null,
    monthlyCostLimitUsd: parsed.data.monthlyCostLimitUsd?.toString() ?? null,
    enabled: parsed.data.enabled,
    updatedAt: new Date(),
  };
  if (quota) {
    await db.update(apiKeyQuotas).set(values).where(eq(apiKeyQuotas.id, quota.id));
  } else {
    await db.insert(apiKeyQuotas).values({ id: `keyq_${randomUUID()}`, ...values });
  }
  await db.insert(auditEvents).values({
    id: `aud_${randomUUID()}`,
    organizationId: tenant.organizationId,
    actorType: "user",
    actorId: tenant.internalUserId,
    action: "api_key.quota_updated",
    resourceType: "api_key",
    resourceId: id,
    details: {
      requestsPerMinute: parsed.data.requestsPerMinute,
      monthlyTokenLimit: parsed.data.monthlyTokenLimit ?? null,
      monthlyCostLimitUsd: parsed.data.monthlyCostLimitUsd ?? null,
      enabled: parsed.data.enabled,
    },
  });
  return noStore({ data: { id, ...parsed.data } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return noStore({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return noStore({ error: "UNAUTHENTICATED_OR_NOT_ONBOARDED" }, 401);
  const { id } = await context.params;
  const db = getDb();
  const key = await loadScopedKey(id, tenant.organizationId);
  if (!key) return noStore({ error: "NOT_FOUND" }, 404);
  if (!canManageKey(tenant, key)) return noStore({ error: "FORBIDDEN" }, 403);
  if (key.revokedAt) return noStore({ data: { id, revokedAt: key.revokedAt } });

  const revokedAt = new Date();
  await db.transaction(async (tx) => {
    await tx.update(apiKeys).set({ revokedAt, updatedAt: revokedAt }).where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, tenant.organizationId)));
    await tx.update(apiKeyQuotas).set({ enabled: false, updatedAt: revokedAt }).where(and(eq(apiKeyQuotas.apiKeyId, id), eq(apiKeyQuotas.organizationId, tenant.organizationId)));
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
