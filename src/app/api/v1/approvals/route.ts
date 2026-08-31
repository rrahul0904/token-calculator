import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { approvals, auditEvents } from "@/db/schema";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { roleCan } from "@/lib/auth/session";

const createSchema = z.object({
  runId: z.string().max(180).nullable().optional(),
  policyId: z.string().max(180).nullable().optional(),
  reason: z.string().trim().min(3).max(1000),
  expiresAt: z.coerce.date().nullable().optional(),
});
const decideSchema = z.object({
  id: z.string().min(1).max(180),
  status: z.enum(["approved", "denied"]),
  reason: z.string().trim().max(1000).optional(),
});

function reply(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const principal = await authenticateRequest(request, "read:budgets");
  if (!principal) return reply({ error: "UNAUTHORIZED" }, 401);
  const rows = await getDb().select().from(approvals).where(eq(approvals.organizationId, principal.organizationId));
  const now = Date.now();
  return reply({ data: rows.map((row) => ({ ...row, effectiveStatus: row.status === "pending" && row.expiresAt && row.expiresAt.getTime() < now ? "expired" : row.status })) });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const principal = await authenticateRequest(request, "read:budgets");
  if (!principal) return reply({ error: "UNAUTHORIZED" }, 401);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  const id = `apr_${randomUUID()}`;
  await getDb().insert(approvals).values({
    id,
    organizationId: principal.organizationId,
    runId: parsed.data.runId ?? null,
    policyId: parsed.data.policyId ?? null,
    status: "pending",
    requestedBy: principal.kind === "session" ? principal.tenant.internalUserId : principal.apiKeyId,
    reason: parsed.data.reason,
    expiresAt: parsed.data.expiresAt ?? null,
  });
  return reply({ data: { id, status: "pending" } }, 201);
}

export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const principal = await authenticateRequest(request, "write:budgets");
  if (!principal) return reply({ error: "UNAUTHORIZED" }, 401);
  if (principal.kind !== "session" || !roleCan(principal.tenant.role, "policy:manage")) return reply({ error: "FORBIDDEN" }, 403);
  const parsed = decideSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  const db = getDb();
  const row = (await db.select().from(approvals).where(and(eq(approvals.id, parsed.data.id), eq(approvals.organizationId, principal.organizationId))).limit(1))[0];
  if (!row) return reply({ error: "NOT_FOUND" }, 404);
  if (row.status !== "pending") return reply({ error: "APPROVAL_ALREADY_DECIDED", status: row.status }, 409);
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    await db.update(approvals).set({ status: "expired", updatedAt: new Date() }).where(eq(approvals.id, row.id));
    return reply({ error: "APPROVAL_EXPIRED" }, 409);
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(approvals).set({ status: parsed.data.status, decidedBy: principal.tenant.internalUserId, decidedAt: now, reason: parsed.data.reason ?? row.reason, updatedAt: now }).where(eq(approvals.id, row.id));
    await tx.insert(auditEvents).values({
      id: `aud_${randomUUID()}`,
      organizationId: principal.organizationId,
      actorType: "user",
      actorId: principal.tenant.internalUserId,
      action: `approval.${parsed.data.status}`,
      resourceType: "approval",
      resourceId: row.id,
      details: { runId: row.runId, policyId: row.policyId },
    });
  });
  return reply({ data: { id: row.id, status: parsed.data.status, decidedAt: now } });
}
