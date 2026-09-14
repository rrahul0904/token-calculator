import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { teams } from "@/db/gap-closure-schema";
import { requireTenant } from "@/lib/auth/session";

const createSchema = z.object({ name: z.string().trim().min(2).max(120), slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), costCenter: z.string().trim().max(160).nullable().optional() });
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const rows = await getDb().select().from(teams).where(eq(teams.organizationId, tenant.organizationId)).orderBy(asc(teams.name));
    return reply({ data: rows });
  } catch (error) { return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403); }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("org:manage");
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    const row = (await getDb().insert(teams).values({ id: `team_${randomUUID()}`, organizationId: tenant.organizationId, name: parsed.data.name, slug: parsed.data.slug, costCenter: parsed.data.costCenter ?? null }).returning())[0];
    return reply({ data: row }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CREATE_FAILED";
    return reply({ error: message }, message.toLowerCase().includes("unique") ? 409 : 403);
  }
}
