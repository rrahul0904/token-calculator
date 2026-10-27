import { and, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { apiKeyQuotas } from "@/db/controls-schema";
import { organizations } from "@/db/schema";
import { authenticateApiKey } from "@/lib/auth/api-auth";
import { SIMULATED_MODEL_ID } from "@/lib/inference/simulation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Inference-Simulated": "true" },
  });
}

/** A deliberately non-public engineering simulator, not a provider-backed model catalog. */
export async function GET(request: Request): Promise<Response> {
  if (process.env.INFERENCE_SIMULATION_ENABLED !== "1") return reply({ error: "SIMULATION_DISABLED" }, 404);
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const principal = await authenticateApiKey(request, "gateway:invoke");
    if (!principal) return reply({ error: "API_KEY_REQUIRED" }, 401);
    const [org] = await getDb().select({ plan: organizations.plan }).from(organizations)
      .where(eq(organizations.id, principal.organizationId)).limit(1);
    if (!org || org.plan !== "enterprise") return reply({ error: "GATEWAY_PLAN_REQUIRED" }, 403);
    const [quota] = await getDb().select({ enabled: apiKeyQuotas.enabled }).from(apiKeyQuotas)
      .where(and(
        eq(apiKeyQuotas.apiKeyId, principal.apiKeyId),
        eq(apiKeyQuotas.organizationId, principal.organizationId),
      )).limit(1);
    if (!quota?.enabled) return reply({ error: "API_KEY_QUOTA_DISABLED" }, 403);
    return reply({
      object: "list",
      data: [{ id: SIMULATED_MODEL_ID, object: "model", owned_by: "token-intelligence", simulated: true }],
      warning: "A protocol acceptance simulator only; no model weights, GPU or inference provider is connected.",
    });
  } catch {
    return reply({ error: "SIMULATION_BACKEND_UNAVAILABLE" }, 503);
  }
}
