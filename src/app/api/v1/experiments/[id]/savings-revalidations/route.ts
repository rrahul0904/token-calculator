import { and, desc, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { experiments, verifiedSavingsRevalidations } from "@/db/gap-closure-schema";
import { requireTenant } from "@/lib/auth/session";
import { reverifyExperimentSavings } from "@/lib/evaluations/verified-savings";

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
    const rows = await getDb().select().from(verifiedSavingsRevalidations)
      .where(and(
        eq(verifiedSavingsRevalidations.organizationId, tenant.organizationId),
        eq(verifiedSavingsRevalidations.experimentId, id),
      ))
      .orderBy(desc(verifiedSavingsRevalidations.checkedAt));
    return reply({ data: rows });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403);
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("scenarios:write");
    const { id } = await context.params;
    const outcome = await reverifyExperimentSavings(getDb(), tenant.organizationId, id, "manual_reverification");
    if (outcome.kind === "not_found") return reply({ error: "EXPERIMENT_NOT_FOUND" }, 404);
    if (outcome.kind === "no_verified_savings") return reply({ error: "VERIFIED_SAVINGS_REQUIRED" }, 409);
    return reply({ data: outcome.revalidation, status: outcome.status, verifiedSavings: outcome.record }, 201);
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403);
  }
}
