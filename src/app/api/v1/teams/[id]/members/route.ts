import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { organizationMembers, users } from "@/db/schema";
import { teamMembers, teams } from "@/db/gap-closure-schema";
import { requireTenant } from "@/lib/auth/session";

const memberSchema = z.object({ userId: z.string().min(1).max(180), role: z.enum(["lead", "member", "viewer"]).default("member") });
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function assertTeam(organizationId: string, id: string) {
  const row = (await getDb().select({ id: teams.id }).from(teams).where(and(eq(teams.id, id), eq(teams.organizationId, organizationId))).limit(1))[0];
  if (!row) throw new Error("TEAM_NOT_FOUND");
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const { id } = await context.params;
    await assertTeam(tenant.organizationId, id);
    const rows = await getDb().select({ id: teamMembers.id, userId: teamMembers.userId, role: teamMembers.role, name: users.name, email: users.email }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId)).where(and(eq(teamMembers.teamId, id), eq(teamMembers.organizationId, tenant.organizationId)));
    return reply({ data: rows });
  } catch (error) { const message = error instanceof Error ? error.message : "AUTHORIZATION_FAILED"; return reply({ error: message }, message === "TEAM_NOT_FOUND" ? 404 : 403); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("org:manage");
    const { id } = await context.params;
    await assertTeam(tenant.organizationId, id);
    const parsed = memberSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    const orgMember = (await getDb().select({ id: organizationMembers.id }).from(organizationMembers).where(and(eq(organizationMembers.organizationId, tenant.organizationId), eq(organizationMembers.userId, parsed.data.userId))).limit(1))[0];
    if (!orgMember) return reply({ error: "USER_NOT_ORGANIZATION_MEMBER" }, 400);
    const row = (await getDb().insert(teamMembers).values({ id: `tm_${randomUUID()}`, organizationId: tenant.organizationId, teamId: id, userId: parsed.data.userId, role: parsed.data.role }).onConflictDoUpdate({ target: [teamMembers.teamId, teamMembers.userId], set: { role: parsed.data.role, updatedAt: new Date() } }).returning())[0];
    return reply({ data: row }, 201);
  } catch (error) { const message = error instanceof Error ? error.message : "CREATE_FAILED"; return reply({ error: message }, message === "TEAM_NOT_FOUND" ? 404 : 403); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("org:manage");
    const { id } = await context.params;
    await assertTeam(tenant.organizationId, id);
    const userId = new URL(request.url).searchParams.get("userId");
    if (!userId) return reply({ error: "USER_ID_REQUIRED" }, 400);
    const deleted = await getDb().delete(teamMembers).where(and(eq(teamMembers.organizationId, tenant.organizationId), eq(teamMembers.teamId, id), eq(teamMembers.userId, userId))).returning({ id: teamMembers.id });
    return reply({ deleted: Boolean(deleted[0]) });
  } catch (error) { const message = error instanceof Error ? error.message : "DELETE_FAILED"; return reply({ error: message }, message === "TEAM_NOT_FOUND" ? 404 : 403); }
}
