import { ZodError } from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { authenticateApiKey } from "@/lib/auth/api-auth";
import { ingestTelemetryEvent } from "@/lib/telemetry/ingest";

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function statusFor(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  if (error instanceof ZodError) return 400;
  if (["PROJECT_SCOPE_VIOLATION", "CROSS_TENANT_REFERENCE"].includes(message)) return 403;
  if (["RUN_NOT_FOUND", "TURN_NOT_FOUND", "LLM_CALL_NOT_FOUND"].includes(message)) return 404;
  if (message === "CONTENT_RETENTION_DISABLED") return 422;
  return 400;
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const principal = await authenticateApiKey(request, "write:events");
  if (!principal) return reply({ error: "API_KEY_REQUIRED", scope: "write:events" }, 401);
  try {
    const result = await ingestTelemetryEvent(getDb(), {
      organizationId: principal.organizationId,
      projectId: principal.projectId,
    }, await request.json());
    return reply({ data: result }, result.duplicate ? 200 : 201);
  } catch (error) {
    const violations = error instanceof Error && "violations" in error ? (error as Error & { violations?: unknown }).violations : undefined;
    return reply({ error: error instanceof Error ? error.message : "INGEST_FAILED", violations }, statusFor(error));
  }
}
