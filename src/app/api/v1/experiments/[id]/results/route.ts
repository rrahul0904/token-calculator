import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { runs } from "@/db/schema";
import { evaluationCases, experimentResults, experiments } from "@/db/gap-closure-schema";
import { requireTenant } from "@/lib/auth/session";
import { evaluateSuite, type EvaluatorSpec } from "@/lib/evaluations/engine";
import { assertMetadataOnly } from "@/lib/telemetry/privacy";

const evaluatorSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string().min(1).max(120), kind: z.literal("json_schema"), requiredKeys: z.array(z.string().min(1).max(120)).max(100) }),
  z.object({ id: z.string().min(1).max(120), kind: z.literal("tests_passed"), required: z.boolean() }),
  z.object({ id: z.string().min(1).max(120), kind: z.literal("expected_tool"), tool: z.string().min(1).max(180) }),
  z.object({ id: z.string().min(1).max(120), kind: z.literal("required_artifact"), artifactType: z.string().min(1).max(180) }),
  z.object({ id: z.string().min(1).max(120), kind: z.literal("ci_result"), required: z.boolean() }),
  z.object({ id: z.string().min(1).max(120), kind: z.literal("custom_boolean"), key: z.string().min(1).max(120), expected: z.boolean() }),
  z.object({ id: z.string().min(1).max(120), kind: z.literal("custom_numeric"), key: z.string().min(1).max(120), operator: z.enum([">=", ">", "<=", "<", "=="]), threshold: z.number().finite() }),
]);

const observationSchema = z.object({
  outputJson: z.unknown().optional(),
  testsPassed: z.boolean().nullable().optional(),
  toolsInvoked: z.array(z.string().max(180)).max(200).optional(),
  artifacts: z.array(z.object({ type: z.string().max(180), reference: z.string().max(500).nullable().optional() })).max(200).optional(),
  ciPassed: z.boolean().nullable().optional(),
  custom: z.record(z.string(), z.union([z.boolean(), z.number().finite(), z.null()])).optional(),
});

const resultSchema = z.object({
  variant: z.enum(["baseline", "candidate"]),
  caseId: z.string().max(180).nullable().optional(),
  runId: z.string().max(180).nullable().optional(),
  qualityScore: z.number().min(0).max(1).nullable().optional(),
  costUsd: z.number().min(0).nullable().optional(),
  tokens: z.number().int().min(0).nullable().optional(),
  latencyMs: z.number().int().min(0).nullable().optional(),
  retries: z.number().int().min(0).max(10000).default(0),
  fallbacks: z.number().int().min(0).max(10000).default(0),
  success: z.boolean().nullable().optional(),
  evaluatorSpecs: z.array(evaluatorSchema).max(100).optional(),
  observation: observationSchema.optional(),
}).superRefine((value, ctx) => {
  if ((value.evaluatorSpecs?.length ?? 0) > 0 && !value.observation) {
    ctx.addIssue({ code: "custom", path: ["observation"], message: "observation is required when evaluatorSpecs are supplied" });
  }
});

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function experimentForTenant(id: string, organizationId: string) {
  return (await getDb().select().from(experiments)
    .where(and(eq(experiments.id, id), eq(experiments.organizationId, organizationId)))
    .limit(1))[0] ?? null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const { id } = await context.params;
    const experiment = await experimentForTenant(id, tenant.organizationId);
    if (!experiment) return reply({ error: "EXPERIMENT_NOT_FOUND" }, 404);
    const rows = await getDb().select().from(experimentResults)
      .where(and(eq(experimentResults.experimentId, id), eq(experimentResults.organizationId, tenant.organizationId)))
      .orderBy(asc(experimentResults.createdAt));
    return reply({ data: rows });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("scenarios:write");
    const { id } = await context.params;
    const experiment = await experimentForTenant(id, tenant.organizationId);
    if (!experiment) return reply({ error: "EXPERIMENT_NOT_FOUND" }, 404);
    const parsed = resultSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    const db = getDb();

    if (parsed.data.caseId) {
      const caseRow = (await db.select({ organizationId: evaluationCases.organizationId, datasetId: evaluationCases.datasetId })
        .from(evaluationCases).where(eq(evaluationCases.id, parsed.data.caseId)).limit(1))[0];
      if (!caseRow) return reply({ error: "CASE_NOT_FOUND" }, 404);
      if (caseRow.organizationId !== tenant.organizationId || caseRow.datasetId !== experiment.datasetId) return reply({ error: "CROSS_TENANT_OR_DATASET_REFERENCE" }, 403);
    }
    if (parsed.data.runId) {
      const run = (await db.select({ organizationId: runs.organizationId }).from(runs).where(eq(runs.id, parsed.data.runId)).limit(1))[0];
      if (!run) return reply({ error: "RUN_NOT_FOUND" }, 404);
      if (run.organizationId !== tenant.organizationId) return reply({ error: "CROSS_TENANT_REFERENCE" }, 403);
    }

    let qualityScore = parsed.data.qualityScore ?? null;
    let success = parsed.data.success ?? null;
    let evaluatorResults: Array<Record<string, unknown>> = [];
    if ((parsed.data.evaluatorSpecs?.length ?? 0) > 0 && parsed.data.observation) {
      assertMetadataOnly(parsed.data.observation);
      const evaluated = evaluateSuite(parsed.data.evaluatorSpecs as EvaluatorSpec[], parsed.data.observation);
      qualityScore = evaluated.qualityScore;
      success = evaluated.passed;
      evaluatorResults = evaluated.results.map((result) => ({ ...result }));
    }

    const row = (await db.insert(experimentResults).values({
      id: `exr_${randomUUID()}`,
      organizationId: tenant.organizationId,
      experimentId: id,
      variant: parsed.data.variant,
      caseId: parsed.data.caseId ?? null,
      runId: parsed.data.runId ?? null,
      qualityScore: qualityScore === null ? null : String(qualityScore),
      costUsd: parsed.data.costUsd === null || parsed.data.costUsd === undefined ? null : String(parsed.data.costUsd),
      tokens: parsed.data.tokens ?? null,
      latencyMs: parsed.data.latencyMs ?? null,
      retries: parsed.data.retries,
      fallbacks: parsed.data.fallbacks,
      success,
      evaluatorResults,
    }).returning())[0];

    if (experiment.status === "draft") {
      await db.update(experiments).set({ status: "running", updatedAt: new Date() }).where(eq(experiments.id, id));
    }
    return reply({ data: row }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CREATE_FAILED";
    return reply({ error: message }, message === "CONTENT_RETENTION_DISABLED" ? 400 : 403);
  }
}
