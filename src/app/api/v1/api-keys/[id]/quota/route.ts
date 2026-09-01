import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { apiKeyQuotas } from "@/db/controls-schema";
import { apiKeys, auditEvents } from "@/db/schema";
import { getTenantContext } from "@/lib/auth/session";

const quotaSchema = z.object({
  requestsPerMinute: z.number().int().min(1).max(10_000),
  monthlyTokenLimit: z.number().int().positive().nullable().optional(),
  monthlyCostLimitUsd: z.number().positive().max(1_000_000).nullable().optional(),
  enabled: z.boolean().default(true),
});

function noStore(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function scopedKey(id: string, organizationId: string) {
  return (await getDb().select().from(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, organizationId))).limit(1))[0] ?? null;
}

function canManage(tenant: { role: string; internalUserId: string }, key: { createdByUserId: string | null }) {
  return tenant.role === "owner" || tenant.role === "admin" || key.createdByUserId === tenant.internalUserId;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return noStore({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return noStore({ error: "UNAUTHENTICATED_OR_NOT_ONBOARDED" }, 401);
  const { id } = await context.params;
  const key = await scopedKey(id, tenant.organizationId);
  if (!key) return noStore({ error: "NOT_FOUND" }, 404);
  if (!canManage(tenant, key)) return noStore({ error: "FORBIDDEN" }, 403);
  const quota = (await getDb().select().from(apiKeyQuotas).where(and(
    eq(apiKeyQuotas.organizationId, tenant.organizationId),
    eq(apiKeyQuotas.apiKeyId, id),
  )).limit(1))[0] ?? null;
  return noStore({
    data: quota ? {
      apiKeyId: id,
      requestsPerMinute: quota.requestsPerMinute,
      monthlyTokenLimit: quota.monthlyTokenLimit,
      monthlyCostLimitUsd: quota.monthlyCostLimitUsd,
      enabled: quota.enabled,
      updatedAt: quota.updatedAt,
    } : {
      apiKeyId: id,
      requestsPerMinute: 120,
      monthlyTokenLimit: null,
      monthlyCostLimitUsd: null,
      enabled: true,
      inheritedDefault: true,
    },
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return noStore({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return noStore({ error: "UNAUTHENTICATED_OR_NOT_ONBOARDED" }, 401);
  const { id } = await context.params;
  const key = await scopedKey(id, tenant.organizationId);
  if (!key) return noStore({ error: "NOT_FOUND" }, 404);
  if (!canManage(tenant, key)) return noStore({ error: "FORBIDDEN" }, 403);
  if (key.revokedAt) return noStore({ error: "KEY_REVOKED" }, 409);
  const parsed = quotaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

  const db = getDb();
  const existing = (await db.select().from(apiKeyQuotas).where(and(
    eq(apiKeyQuotas.organizationId, tenant.organizationId),
    eq(apiKeyQuotas.apiKeyId, id),
  )).limit(1))[0];
  const now = new Date();
  const values = {
    organizationId: tenant.organizationId,
    apiKeyId: id,
    requestsPerMinute: parsed.data.requestsPerMinute,
    monthlyTokenLimit: parsed.data.monthlyTokenLimit ?? null,
    monthlyCostLimitUsd: parsed.data.monthlyCostLimitUsd?.toString() ?? null,
    enabled: parsed.data.enabled,
    updatedAt: now,
  };
  await db.transaction(async (tx) => {
    if (existing) await tx.update(apiKeyQuotas).set(values).where(eq(apiKeyQuotas.id, existing.id));
    else await tx.insert(apiKeyQuotas).values({ id: `keyq_${randomUUID()}`, ...values });
    await tx.insert(auditEvents).values({
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
  });
  return noStore({ data: { apiKeyId: id, ...parsed.data, updatedAt: now } });
}
