import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { getTenantContext } from "@/lib/auth/session";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function validDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return json({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return json({ error: "UNAUTHENTICATED" }, 401);
  if (tenant.role !== "owner" && tenant.role !== "admin") return json({ error: "FORBIDDEN" }, 403);

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 5_000) || 5_000, 1), 25_000);
  const from = validDate(url.searchParams.get("from"));
  const to = validDate(url.searchParams.get("to"));
  if (url.searchParams.get("from") && !from) return json({ error: "INVALID_FROM" }, 400);
  if (url.searchParams.get("to") && !to) return json({ error: "INVALID_TO" }, 400);
  if (from && to && from > to) return json({ error: "INVALID_RANGE" }, 400);

  const predicates = [eq(auditEvents.organizationId, tenant.organizationId)];
  if (from) predicates.push(gte(auditEvents.occurredAt, from));
  if (to) predicates.push(lte(auditEvents.occurredAt, to));

  const rows = await getDb().select({
    id: auditEvents.id,
    organizationId: auditEvents.organizationId,
    actorType: auditEvents.actorType,
    actorId: auditEvents.actorId,
    action: auditEvents.action,
    resourceType: auditEvents.resourceType,
    resourceId: auditEvents.resourceId,
    details: auditEvents.details,
    ipHash: auditEvents.ipHash,
    userAgentHash: auditEvents.userAgentHash,
    occurredAt: auditEvents.occurredAt,
  }).from(auditEvents)
    .where(and(...predicates))
    .orderBy(desc(auditEvents.occurredAt))
    .limit(limit);

  const body = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="token-intelligence-audit-${date}.ndjson"`,
      "X-Content-Type-Options": "nosniff",
      "X-Token-Intelligence-Export-Count": String(rows.length),
    },
  });
}
