import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import * as z from "zod";
import { auditEvents, organizationMembers } from "@/db/schema";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { getTenantContext, roleCan } from "@/lib/auth/session";

const roleSchema = z.enum(["owner", "admin", "finance", "developer", "viewer"]);

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function ownerCount(organizationId: string) {
  const rows = await getDb().select({ value: count() }).from(organizationMembers).where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.role, "owner")));
  return Number(rows[0]?.value ?? 0);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED_OR_NOT_ONBOARDED" }, 401);
  if (!roleCan(tenant.role, "org:manage")) return reply({ error: "FORBIDDEN" }, 403);
  const { id } = await context.params;
  const parsed = z.object({ role: roleSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

  const db = getDb();
  const member = (await db.select().from(organizationMembers).where(and(eq(organizationMembers.id, id), eq(organizationMembers.organizationId, tenant.organizationId))).limit(1))[0];
  if (!member) return reply({ error: "NOT_FOUND" }, 404);

  // Only an owner can create/remove owner/admin authority. Admins may manage lower-privilege roles.
  if (tenant.role !== "owner" && (["owner", "admin"].includes(member.role) || ["owner", "admin"].includes(parsed.data.role))) {
    return reply({ error: "OWNER_REQUIRED_FOR_PRIVILEGED_ROLE_CHANGE" }, 403);
  }
  if (member.role === "owner" && parsed.data.role !== "owner" && await ownerCount(tenant.organizationId) <= 1) {
    return reply({ error: "LAST_OWNER_PROTECTED" }, 409);
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(organizationMembers).set({ role: parsed.data.role, updatedAt: now }).where(and(eq(organizationMembers.id, id), eq(organizationMembers.organizationId, tenant.organizationId)));
    await tx.insert(auditEvents).values({ id: `aud_${randomUUID()}`, organizationId: tenant.organizationId, actorType: "user", actorId: tenant.internalUserId, action: "member.role_changed", resourceType: "organization_member", resourceId: id, details: { from: member.role, to: parsed.data.role } });
  });
  return reply({ data: { id, role: parsed.data.role } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED_OR_NOT_ONBOARDED" }, 401);
  if (!roleCan(tenant.role, "org:manage")) return reply({ error: "FORBIDDEN" }, 403);
  const { id } = await context.params;
  const db = getDb();
  const member = (await db.select().from(organizationMembers).where(and(eq(organizationMembers.id, id), eq(organizationMembers.organizationId, tenant.organizationId))).limit(1))[0];
  if (!member) return reply({ error: "NOT_FOUND" }, 404);
  if (tenant.role !== "owner" && member.role === "owner") return reply({ error: "OWNER_REQUIRED" }, 403);
  if (member.role === "owner" && await ownerCount(tenant.organizationId) <= 1) return reply({ error: "LAST_OWNER_PROTECTED" }, 409);

  await db.transaction(async (tx) => {
    await tx.delete(organizationMembers).where(and(eq(organizationMembers.id, id), eq(organizationMembers.organizationId, tenant.organizationId)));
    await tx.insert(auditEvents).values({ id: `aud_${randomUUID()}`, organizationId: tenant.organizationId, actorType: "user", actorId: tenant.internalUserId, action: "member.removed", resourceType: "organization_member", resourceId: id, details: { removedUserId: member.userId, role: member.role } });
  });
  return reply({ data: { id, removed: true } });
}
