import { and, desc, eq, lt } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { getTenantContext } from "@/lib/auth/session";

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED" }, 401);
  if (tenant.role !== "owner" && tenant.role !== "admin") return reply({ error: "FORBIDDEN" }, 403);

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100) || 100, 1), 500);
  const beforeRaw = url.searchParams.get("before");
  const before = beforeRaw ? new Date(beforeRaw) : null;
  const where = before && Number.isFinite(before.getTime())
    ? and(eq(auditEvents.organizationId, tenant.organizationId), lt(auditEvents.occurredAt, before))
    : eq(auditEvents.organizationId, tenant.organizationId);
  const rows = await getDb().select().from(auditEvents).where(where).orderBy(desc(auditEvents.occurredAt)).limit(limit);

  if (url.searchParams.get("format") === "ndjson") {
    const body = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
    return new Response(body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": `attachment; filename="token-intelligence-audit-${new Date().toISOString().slice(0, 10)}.ndjson"`,
      },
    });
  }

  return reply({
    data: rows,
    paging: { nextBefore: rows.length === limit ? rows.at(-1)?.occurredAt.toISOString() ?? null : null, limit },
  });
}
