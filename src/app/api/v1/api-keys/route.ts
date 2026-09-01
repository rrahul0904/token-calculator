import { randomUUID } from "node:crypto";
import { and, count, eq, isNull } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { apiKeyQuotas } from "@/db/controls-schema";
import { apiKeys, auditEvents, projects, serviceAccounts } from "@/db/schema";
import { getTenantContext } from "@/lib/auth/session";
import { PLAN_ENTITLEMENTS, hasEntitlement } from "@/lib/billing/entitlements";
import { generateApiKey } from "@/lib/security/api-keys";

const allowedScopes = ["read:models", "read:usage", "read:runs", "write:events", "write:runs", "read:budgets", "write:budgets", "mcp:tools", "gateway:invoke"] as const;
const requestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  environment: z.enum(["live", "test"]).default("live"),
  projectId: z.string().max(180).nullable().optional(),
  serviceAccountId: z.string().max(180).nullable().optional(),
  scopes: z.array(z.enum(allowedScopes)).min(1).max(12),
  requestsPerMinute: z.number().int().min(1).max(10_000).default(120),
  monthlyTokenLimit: z.number().int().positive().nullable().optional(),
  monthlyCostLimitUsd: z.number().positive().max(1_000_000).nullable().optional(),
});

function noStore(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  if (!isDatabaseConfigured()) return noStore({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return noStore({ error: "UNAUTHENTICATED_OR_NOT_ONBOARDED" }, 401);
  const rows = await getDb().select({
    id: apiKeys.id,
    name: apiKeys.name,
    environment: apiKeys.environment,
    prefix: apiKeys.prefix,
    lastFour: apiKeys.lastFour,
    scopes: apiKeys.scopes,
    projectId: apiKeys.projectId,
    serviceAccountId: apiKeys.serviceAccountId,
    createdAt: apiKeys.createdAt,
    lastUsedAt: apiKeys.lastUsedAt,
    revokedAt: apiKeys.revokedAt,
    requestsPerMinute: apiKeyQuotas.requestsPerMinute,
    monthlyTokenLimit: apiKeyQuotas.monthlyTokenLimit,
    monthlyCostLimitUsd: apiKeyQuotas.monthlyCostLimitUsd,
    quotaEnabled: apiKeyQuotas.enabled,
  }).from(apiKeys)
    .leftJoin(apiKeyQuotas, and(eq(apiKeyQuotas.apiKeyId, apiKeys.id), eq(apiKeyQuotas.organizationId, tenant.organizationId)))
    .where(eq(apiKeys.organizationId, tenant.organizationId));
  return noStore({ data: rows });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return noStore({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return noStore({ error: "UNAUTHENTICATED_OR_NOT_ONBOARDED" }, 401);
  if (!(["owner", "admin", "developer"] as const).includes(tenant.role as "owner" | "admin" | "developer")) {
    return noStore({ error: "FORBIDDEN" }, 403);
  }

  const entitlements = PLAN_ENTITLEMENTS[tenant.plan];
  if (!hasEntitlement(entitlements, "personal_api_key")) return noStore({ error: "PLAN_UPGRADE_REQUIRED", entitlement: "personal_api_key" }, 402);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  if (parsed.data.scopes.includes("gateway:invoke") && !hasEntitlement(entitlements, "gateway")) {
    return noStore({ error: "PLAN_UPGRADE_REQUIRED", entitlement: "gateway" }, 402);
  }
  if (parsed.data.serviceAccountId) {
    if (tenant.role !== "owner" && tenant.role !== "admin") return noStore({ error: "FORBIDDEN", reason: "SERVICE_ACCOUNT_KEY_REQUIRES_ORG_MANAGER" }, 403);
    if (!hasEntitlement(entitlements, "service_accounts")) return noStore({ error: "PLAN_UPGRADE_REQUIRED", entitlement: "service_accounts" }, 402);
  }

  const db = getDb();
  if (parsed.data.projectId) {
    const project = (await db.select({ id: projects.id, archivedAt: projects.archivedAt }).from(projects).where(and(
      eq(projects.id, parsed.data.projectId),
      eq(projects.organizationId, tenant.organizationId),
    )).limit(1))[0];
    if (!project) return noStore({ error: "PROJECT_NOT_FOUND" }, 404);
    if (project.archivedAt) return noStore({ error: "PROJECT_ARCHIVED" }, 409);
  }
  if (parsed.data.serviceAccountId) {
    const serviceAccount = (await db.select({ id: serviceAccounts.id, revokedAt: serviceAccounts.revokedAt }).from(serviceAccounts).where(and(
      eq(serviceAccounts.id, parsed.data.serviceAccountId),
      eq(serviceAccounts.organizationId, tenant.organizationId),
    )).limit(1))[0];
    if (!serviceAccount) return noStore({ error: "SERVICE_ACCOUNT_NOT_FOUND" }, 404);
    if (serviceAccount.revokedAt) return noStore({ error: "SERVICE_ACCOUNT_REVOKED" }, 409);
  }

  const active = await db.select({ value: count() }).from(apiKeys).where(and(eq(apiKeys.organizationId, tenant.organizationId), isNull(apiKeys.revokedAt)));
  const limit = entitlements.apiKeys;
  if (limit !== null && Number(active[0]?.value ?? 0) >= limit) return noStore({ error: "API_KEY_LIMIT_REACHED", limit }, 429);

  const material = generateApiKey(parsed.data.environment);
  const id = `key_${randomUUID()}`;
  const quotaId = `keyq_${randomUUID()}`;
  await db.transaction(async (tx) => {
    await tx.insert(apiKeys).values({
      id,
      organizationId: tenant.organizationId,
      createdByUserId: tenant.internalUserId,
      serviceAccountId: parsed.data.serviceAccountId ?? null,
      projectId: parsed.data.projectId ?? null,
      name: parsed.data.name,
      environment: material.environment,
      prefix: material.prefix,
      lastFour: material.lastFour,
      secretHash: material.hash,
      scopes: parsed.data.scopes,
    });
    await tx.insert(apiKeyQuotas).values({
      id: quotaId,
      organizationId: tenant.organizationId,
      apiKeyId: id,
      requestsPerMinute: parsed.data.requestsPerMinute,
      monthlyTokenLimit: parsed.data.monthlyTokenLimit ?? null,
      monthlyCostLimitUsd: parsed.data.monthlyCostLimitUsd?.toString() ?? null,
      enabled: true,
    });
    await tx.insert(auditEvents).values({
      id: `aud_${randomUUID()}`,
      organizationId: tenant.organizationId,
      actorType: "user",
      actorId: tenant.internalUserId,
      action: "api_key.created",
      resourceType: "api_key",
      resourceId: id,
      details: {
        name: parsed.data.name,
        scopes: parsed.data.scopes,
        environment: material.environment,
        projectId: parsed.data.projectId ?? null,
        serviceAccountId: parsed.data.serviceAccountId ?? null,
        quota: {
          requestsPerMinute: parsed.data.requestsPerMinute,
          monthlyTokenLimit: parsed.data.monthlyTokenLimit ?? null,
          monthlyCostLimitUsd: parsed.data.monthlyCostLimitUsd ?? null,
        },
      },
    });
  });

  return noStore({
    data: {
      id,
      secret: material.secret,
      prefix: material.prefix,
      lastFour: material.lastFour,
      scopes: parsed.data.scopes,
      projectId: parsed.data.projectId ?? null,
      serviceAccountId: parsed.data.serviceAccountId ?? null,
      quota: {
        requestsPerMinute: parsed.data.requestsPerMinute,
        monthlyTokenLimit: parsed.data.monthlyTokenLimit ?? null,
        monthlyCostLimitUsd: parsed.data.monthlyCostLimitUsd ?? null,
      },
      warning: "This secret is returned once and is not stored in plaintext.",
    },
  }, 201);
}
