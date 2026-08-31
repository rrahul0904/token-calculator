import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { auditEvents, serviceAccounts } from "@/db/schema";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { getTenantContext, roleCan } from "@/lib/auth/session";
import { PLAN_ENTITLEMENTS, hasEntitlement } from "@/lib/billing/entitlements";

const createSchema = z.object({ name: z.string().trim().min(2).max(100) });

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED" }, 401);
  if (!roleCan(tenant.role, "org:manage") && tenant.role !== "developer") return reply({ error: "FORBIDDEN" }, 403);
  const rows = await getDb().select({ id: serviceAccounts.id, name: serviceAccounts.name, revokedAt: serviceAccounts.revokedAt, createdAt: serviceAccounts.createdAt }).from(serviceAccounts).where(eq(serviceAccounts.organizationId, tenant.organizationId));
  return reply({ data: rows });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED" }, 401);
  if (!roleCan(tenant.role, "org:manage")) return reply({ error: "FORBIDDEN" }, 403);
  if (!hasEntitlement(PLAN_ENTITLEMENTS[tenant.plan], "service_accounts")) return reply({ error: "PLAN_UPGRADE_REQUIRED", entitlement: "service_accounts" }, 402);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  const id = `svc_${randomUUID()}`;
  await getDb().transaction(async (tx) => {
    await tx.insert(serviceAccounts).values({ id, organizationId: tenant.organizationId, name: parsed.data.name, createdByUserId: tenant.internalUserId });
    await tx.insert(auditEvents).values({ id: `aud_${randomUUID()}`, organizationId: tenant.organizationId, actorType: "user", actorId: tenant.internalUserId, action: "service_account.created", resourceType: "service_account", resourceId: id, details: { name: parsed.data.name } });
  });
  return reply({ data: { id, name: parsed.data.name } }, 201);
}
