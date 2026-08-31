import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { auditEvents, budgets, policies } from "@/db/schema";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { roleCan } from "@/lib/auth/session";
import { createBudgetSchema, createPolicySchema } from "@/lib/policy/schemas";

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const principal = await authenticateRequest(request, "read:budgets");
  if (!principal) return reply({ error: "UNAUTHORIZED" }, 401);
  const db = getDb();
  const [budgetRows, policyRows] = await Promise.all([
    db.select().from(budgets).where(eq(budgets.organizationId, principal.organizationId)),
    db.select().from(policies).where(eq(policies.organizationId, principal.organizationId)),
  ]);
  return reply({ data: { budgets: budgetRows, policies: policyRows } });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const principal = await authenticateRequest(request, "write:budgets");
  if (!principal) return reply({ error: "UNAUTHORIZED" }, 401);
  if (principal.kind === "session" && !roleCan(principal.tenant.role, "policy:manage")) return reply({ error: "FORBIDDEN" }, 403);
  const body = await request.json().catch(() => null);
  const kind = body && typeof body === "object" && "kind" in body ? (body as { kind?: unknown }).kind : undefined;
  const db = getDb();

  if (kind === "budget") {
    const parsed = createBudgetSchema.safeParse(body && typeof body === "object" ? { ...(body as Record<string, unknown>), kind: undefined } : body);
    if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    const id = `bud_${randomUUID()}`;
    await db.insert(budgets).values({
      id,
      organizationId: principal.organizationId,
      name: parsed.data.name,
      scopeType: parsed.data.scopeType,
      scopeId: parsed.data.scopeId ?? null,
      period: parsed.data.period,
      limitUsd: parsed.data.limitUsd?.toString() ?? null,
      tokenLimit: parsed.data.tokenLimit ?? null,
      warnAtPct: parsed.data.warnAtPct.toString(),
      hardStop: parsed.data.hardStop,
      enabled: parsed.data.enabled,
    });
    await audit(principal, "budget.created", id, parsed.data);
    return reply({ data: { id } }, 201);
  }

  if (kind === "policy") {
    const parsed = createPolicySchema.safeParse(body && typeof body === "object" ? { ...(body as Record<string, unknown>), kind: undefined } : body);
    if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    const id = `pol_${randomUUID()}`;
    await db.insert(policies).values({
      id,
      organizationId: principal.organizationId,
      name: parsed.data.name,
      scopeType: parsed.data.scopeType,
      scopeId: parsed.data.scopeId ?? null,
      priority: parsed.data.priority,
      enabled: parsed.data.enabled,
      rules: parsed.data.rules,
    });
    await audit(principal, "policy.created", id, parsed.data);
    return reply({ data: { id } }, 201);
  }

  return reply({ error: "INVALID_KIND", allowed: ["budget", "policy"] }, 400);
}

async function audit(principal: Awaited<ReturnType<typeof authenticateRequest>> & {}, action: string, resourceId: string, details: unknown) {
  if (!principal) return;
  await getDb().insert(auditEvents).values({
    id: `aud_${randomUUID()}`,
    organizationId: principal.organizationId,
    actorType: principal.kind === "session" ? "user" : "api_key",
    actorId: principal.kind === "session" ? principal.tenant.internalUserId : principal.apiKeyId,
    action,
    resourceType: action.startsWith("budget") ? "budget" : "policy",
    resourceId,
    details: details as Record<string, unknown>,
  });
}
