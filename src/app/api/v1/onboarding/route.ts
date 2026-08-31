import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { organizationMembers, organizations, projects, users } from "@/db/schema";
import { getExternalAuthSession } from "@/lib/auth/session";

const onboardingSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  projectName: z.string().trim().min(2).max(120).default("My first project"),
});

function slugify(value: string): string {
  const base = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "workspace";
  return `${base}-${randomUUID().slice(0, 6)}`;
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const session = await getExternalAuthSession();
  if (!session) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const parsed = onboardingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const existingUsers = await tx.select().from(users).where(eq(users.email, session.email)).limit(1);
    let user = existingUsers[0];
    if (!user) {
      const rows = await tx.insert(users).values({
        id: `usr_${randomUUID()}`,
        workosUserId: session.userId,
        email: session.email,
        name: session.name,
      }).returning();
      user = rows[0];
    } else if (!user.workosUserId) {
      const rows = await tx.update(users).set({ workosUserId: session.userId, name: session.name, updatedAt: new Date() }).where(eq(users.id, user.id)).returning();
      user = rows[0];
    }

    if (session.workosOrganizationId) {
      const existingOrganizations = await tx.select().from(organizations).where(eq(organizations.workosOrganizationId, session.workosOrganizationId)).limit(1);
      const existing = existingOrganizations[0];
      if (existing) {
        await tx.insert(organizationMembers).values({
          id: `mem_${randomUUID()}`,
          organizationId: existing.id,
          userId: user.id,
          role: "developer",
        }).onConflictDoNothing();
        return { organizationId: existing.id, userId: user.id, created: false };
      }
    }

    const organizationId = `org_${randomUUID()}`;
    const projectId = `prj_${randomUUID()}`;
    await tx.insert(organizations).values({
      id: organizationId,
      workosOrganizationId: session.workosOrganizationId,
      name: parsed.data.organizationName,
      slug: slugify(parsed.data.organizationName),
      plan: "free",
    });
    await tx.insert(organizationMembers).values({
      id: `mem_${randomUUID()}`,
      organizationId,
      userId: user.id,
      role: "owner",
    });
    await tx.insert(projects).values({
      id: projectId,
      organizationId,
      name: parsed.data.projectName,
      slug: slugify(parsed.data.projectName),
    });
    return { organizationId, projectId, userId: user.id, created: true };
  });

  return Response.json({ data: result }, { status: result.created ? 201 : 200, headers: { "Cache-Control": "no-store" } });
}
