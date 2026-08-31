import { randomUUID } from "node:crypto";
import { and, count, eq, isNull } from "drizzle-orm";
import * as z from "zod";
import { apiKeys, auditEvents } from "@/db/schema";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { getTenantContext } from "@/lib/auth/session";
import { PLAN_ENTITLEMENTS, hasEntitlement } from "@/lib/billing/entitlements";
import { generateApiKey } from "@/lib/security/api-keys";

const allowedScopes = ["read:models", "read:usage", "read:runs", "write:events", "write:runs", "read:budgets", "write:budgets", "mcp:tools", "gateway:invoke"] as const;
const requestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  environment: z.enum(["live", "test"]).default("live"),
  projectId: z.string().nullable().optional(),
  scopes: z.array(z.enum(allowedScopes)).min(1).max(12),
});

function noStore(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  if (!isDatabaseConfigured()) return noStore({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return noStore({ error: "UNAUTHENTICATED_OR_NOT_ONBOARDED" }, 401);
  const db = getDb();
  const rows = await db.select({
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
  }).from(apiKeys).where(eq(apiKeys.organizationId, tenant.organizationId));
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

  const db = getDb();
  const active = await db.select({ value: count() }).from(apiKeys).where(and(eq(apiKeys.organizationId, tenant.organizationId), isNull(apiKeys.revokedAt)));
  const limit = entitlements.apiKeys;
  if (limit !== null && Number(active[0]?.value ?? 0) >= limit) return noStore({ error: "API_KEY_LIMIT_REACHED", limit }, 429);

  const material = generateApiKey(parsed.data.environment);
  const id = `key_${randomUUID()}`;
  await db.transaction(async (tx) => {
    await tx.insert(apiKeys).values({
      id,
      organizationId: tenant.organizationId,
      createdByUserId: tenant.internalUserId,
      projectId: parsed.data.projectId ?? null,
      name: parsed.data.name,
      environment: material.environment,
      prefix: material.prefix,
      lastFour: material.lastFour,
      secretHash: material.hash,
      scopes: parsed.data.scopes,
    });
    await tx.insert(auditEvents).values({
      id: `aud_${randomUUID()}`,
      organizationId: tenant.organizationId,
      actorType: "user",
      actorId: tenant.internalUserId,
      action: "api_key.created",
      resourceType: "api_key",
      resourceId: id,
      details: { name: parsed.data.name, scopes: parsed.data.scopes, environment: material.environment },
    });
  });

  return noStore({
    data: {
      id,
      secret: material.secret,
      prefix: material.prefix,
      lastFour: material.lastFour,
      scopes: parsed.data.scopes,
      warning: "This secret is returned once and is not stored in plaintext.",
    },
  }, 201);
}
