import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { auditEvents, projects } from "@/db/schema";
import { requireTenant } from "@/lib/auth/session";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
});

function slugify(value: string) {
  const base = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "project";
  return `${base}-${randomUUID().slice(0, 6)}`;
}

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const rows = await getDb().select().from(projects).where(eq(projects.organizationId, tenant.organizationId)).orderBy(projects.name);
    return reply({ data: rows });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403);
  }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("org:manage");
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    const id = `prj_${randomUUID()}`;
    const db = getDb();
    const row = (await db.insert(projects).values({ id, organizationId: tenant.organizationId, name: parsed.data.name, slug: slugify(parsed.data.name), description: parsed.data.description ?? null }).returning())[0];
    await db.insert(auditEvents).values({ id: `aud_${randomUUID()}`, organizationId: tenant.organizationId, actorType: "user", actorId: tenant.internalUserId, action: "project.created", resourceType: "project", resourceId: id, details: { name: parsed.data.name } });
    return reply({ data: row }, 201);
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "CREATE_FAILED" }, 403);
  }
}
