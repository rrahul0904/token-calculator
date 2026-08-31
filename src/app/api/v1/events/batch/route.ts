import { telemetryBatchSchema } from "@/lib/telemetry/schemas";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { authenticateApiKey } from "@/lib/auth/api-auth";
import { ingestTelemetryBatch } from "@/lib/telemetry/ingest";

const MAX_BYTES = 2 * 1024 * 1024;

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return reply({ error: "PAYLOAD_TOO_LARGE", maxBytes: MAX_BYTES }, 413);
  const principal = await authenticateApiKey(request, "write:events");
  if (!principal) return reply({ error: "API_KEY_REQUIRED", scope: "write:events" }, 401);

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) return reply({ error: "PAYLOAD_TOO_LARGE", maxBytes: MAX_BYTES }, 413);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return reply({ error: "INVALID_JSON" }, 400);
  }

  const parsed = telemetryBatchSchema.safeParse(json);
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

  try {
    const results = await ingestTelemetryBatch(
      getDb(),
      { organizationId: principal.organizationId, projectId: principal.projectId },
      parsed.data.events,
    );
    return reply({
      data: {
        atomic: true,
        accepted: results.filter((item) => !item.duplicate).length,
        duplicates: results.filter((item) => item.duplicate).length,
        results,
      },
    }, 201);
  } catch (error) {
    return reply({
      error: "BATCH_REJECTED",
      atomic: true,
      reason: error instanceof Error ? error.message : "INGEST_FAILED",
    }, 400);
  }
}
