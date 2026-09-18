import { and, desc, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { experiments, verifiedSavings } from "@/db/gap-closure-schema";
import { requireTenant } from "@/lib/auth/session";
import { verifyExperimentSavings } from "@/lib/evaluations/verified-savings";

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function experimentExists(organizationId: string, experimentId: string) {
  return Boolean((await getDb().select({ id: experiments.id }).from(experiments)
    .where(and(eq(experiments.id, experimentId), eq(experiments.organizationId, organizationId)))
    .limit(1))[0]);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const { id } = await context.params;
    if (!(await experimentExists(tenant.organizationId, id))) return reply({ error: "EXPERIMENT_NOT_FOUND" }, 404);
    const entries = await getDb().select().from(verifiedSavings)
      .where(and(eq(verifiedSavings.experimentId, id), eq(verifiedSavings.organizationId, tenant.organizationId)))
      .orderBy(desc(verifiedSavings.version));
    return reply({ data: entries });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403);
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("scenarios:write");
    const { id } = await context.params;
    const outcome = await verifyExperimentSavings(getDb(), tenant.organizationId, id, "experiment_gate");
    if (outcome.kind === "not_found") return reply({ error: "EXPERIMENT_NOT_FOUND" }, 404);
    if (outcome.kind === "rejected") return reply({ error: "VERIFIED_SAVINGS_GATE_FAILED", data: outcome.verification }, 409);
    if (outcome.kind === "existing") return reply({ data: outcome.record, created: false });
    return reply({ data: outcome.record, created: true }, 201);
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403);
  }
}
