import { desc, eq, sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { runs } from "@/db/schema";
import { authenticateRequest, authenticateApiKey } from "@/lib/auth/api-auth";
import { ingestTelemetryEvent } from "@/lib/telemetry/ingest";
import { runReceiptSchema } from "@/lib/telemetry/schemas";

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const principal = await authenticateRequest(request, "read:runs");
  if (!principal) return reply({ error: "UNAUTHORIZED" }, 401);
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 200);
  const db = getDb();
  const rows = await db.select().from(runs)
    .where(eq(runs.organizationId, principal.organizationId))
    .orderBy(desc(runs.startedAt))
    .limit(limit);
  return reply({ data: rows, count: rows.length });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const principal = await authenticateApiKey(request, "write:runs");
  if (!principal) return reply({ error: "API_KEY_REQUIRED", scope: "write:runs" }, 401);
  const body = await request.json().catch(() => null);
  const parsed = runReceiptSchema.safeParse(body);
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  const sourceEventId = request.headers.get("idempotency-key") ?? `run:${parsed.data.id}:${parsed.data.status}:${parsed.data.endedAt?.toISOString() ?? "open"}`;
  try {
    const result = await ingestTelemetryEvent(getDb(), { organizationId: principal.organizationId, projectId: principal.projectId }, {
      sourceEventId,
      source: "rest_api",
      eventType: "run.upsert",
      occurredAt: new Date(),
      projectId: parsed.data.projectId ?? principal.projectId,
      runId: parsed.data.id,
      payload: parsed.data,
    });
    return reply({ data: result }, result.duplicate ? 200 : 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "RUN_CREATE_FAILED";
    const status = ["PROJECT_SCOPE_VIOLATION", "CROSS_TENANT_REFERENCE"].includes(message) ? 403 : 400;
    return reply({ error: message }, status);
  }
}
