import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { projects } from "@/db/schema";
import { projectTeams, teams } from "@/db/gap-closure-schema";
import { requireTenant } from "@/lib/auth/session";

const schema = z.object({ projectId: z.string().min(1).max(180) });
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function assertOwned(organizationId: string, teamId: string, projectId?: string | null) {
  const team = (await getDb().select({ id: teams.id }).from(teams).where(and(eq(teams.id, teamId), eq(teams.organizationId, organizationId))).limit(1))[0];
  if (!team) throw new Error("TEAM_NOT_FOUND");
  if (projectId) {
    const project = (await getDb().select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1))[0];
    if (!project) throw new Error("PROJECT_NOT_FOUND");
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const { id } = await context.params;
    await assertOwned(tenant.organizationId, id);
    const rows = await getDb().select({ id: projectTeams.id, projectId: projectTeams.projectId, name: projects.name }).from(projectTeams).innerJoin(projects, eq(projects.id, projectTeams.projectId)).where(and(eq(projectTeams.organizationId, tenant.organizationId), eq(projectTeams.teamId, id)));
    return reply({ data: rows });
  } catch (error) { const message = error instanceof Error ? error.message : "AUTHORIZATION_FAILED"; return reply({ error: message }, message === "TEAM_NOT_FOUND" ? 404 : 403); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("org:manage");
    const { id } = await context.params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    await assertOwned(tenant.organizationId, id, parsed.data.projectId);
    const row = (await getDb().insert(projectTeams).values({ id: `pt_${randomUUID()}`, organizationId: tenant.organizationId, projectId: parsed.data.projectId, teamId: id }).onConflictDoNothing().returning())[0];
    return reply({ data: row ?? { teamId: id, projectId: parsed.data.projectId, existing: true } }, row ? 201 : 200);
  } catch (error) { const message = error instanceof Error ? error.message : "CREATE_FAILED"; return reply({ error: message }, ["TEAM_NOT_FOUND", "PROJECT_NOT_FOUND"].includes(message) ? 404 : 403); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("org:manage");
    const { id } = await context.params;
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (!projectId) return reply({ error: "PROJECT_ID_REQUIRED" }, 400);
    await assertOwned(tenant.organizationId, id, projectId);
    const deleted = await getDb().delete(projectTeams).where(and(eq(projectTeams.organizationId, tenant.organizationId), eq(projectTeams.teamId, id), eq(projectTeams.projectId, projectId))).returning({ id: projectTeams.id });
    return reply({ deleted: Boolean(deleted[0]) });
  } catch (error) { const message = error instanceof Error ? error.message : "DELETE_FAILED"; return reply({ error: message }, ["TEAM_NOT_FOUND", "PROJECT_NOT_FOUND"].includes(message) ? 404 : 403); }
}
