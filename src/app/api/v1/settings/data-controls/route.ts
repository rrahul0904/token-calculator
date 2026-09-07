import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { organizationDataControls } from "@/db/enterprise-schema";
import { auditEvents } from "@/db/schema";
import { getTenantContext, roleCan } from "@/lib/auth/session";

const privacyModes = ["metadata_only", "redacted_content", "full_content", "customer_managed_storage"] as const;
const updateSchema = z.object({
  privacyMode: z.enum(privacyModes).default("metadata_only"),
  requestedDataRegion: z.string().trim().min(2).max(80).nullable().optional(),
});

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function configuredRegion() {
  return process.env.TOKEN_INTELLIGENCE_CONFIGURED_DATA_REGION?.trim() || null;
}
function deploymentRegion() {
  return process.env.TOKEN_INTELLIGENCE_DEPLOYMENT_REGION?.trim() || process.env.VERCEL_REGION?.trim() || null;
}
function regionStatus(requested: string | null, configured: string | null, deployment: string | null) {
  if (requested && configured === requested && deployment === configured) return "verified";
  if (configured) return "configured";
  if (requested) return "requested";
  return "unsupported";
}

async function current(organizationId: string) {
  const row = (await getDb().select().from(organizationDataControls).where(eq(organizationDataControls.organizationId, organizationId)).limit(1))[0];
  const configured = row?.configuredDataRegion ?? configuredRegion();
  const deployment = deploymentRegion();
  const requested = row?.requestedDataRegion ?? null;
  return {
    privacyMode: row?.privacyMode ?? "metadata_only",
    privacyModes: privacyModes.map((mode) => ({ mode, available: mode === "metadata_only", reason: mode === "metadata_only" ? "Metadata-only is the production default." : "Content-retaining modes are not enabled until encrypted content storage, deletion and export controls are deployed end to end." })),
    requestedDataRegion: requested,
    configuredDataRegion: configured,
    deploymentDataRegion: deployment,
    regionStatus: regionStatus(requested, configured, deployment),
    residencyClaim: requested && configured === requested && deployment === configured ? `verified:${requested}` : "not_verified",
  };
}

export async function GET() {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED" }, 401);
  return reply({ data: await current(tenant.organizationId) });
}

export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED" }, 401);
  if (!roleCan(tenant.role, "org:manage")) return reply({ error: "FORBIDDEN" }, 403);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  if (parsed.data.privacyMode !== "metadata_only") {
    return reply({ error: "PRIVACY_MODE_NOT_AVAILABLE", requested: parsed.data.privacyMode, active: "metadata_only", detail: "Token Intelligence will not enable content persistence until encryption, retention, deletion and export controls for that mode are deployed and verified." }, 409);
  }

  const now = new Date();
  const configured = configuredRegion();
  await getDb().transaction(async (tx) => {
    await tx.insert(organizationDataControls).values({
      organizationId: tenant.organizationId,
      privacyMode: "metadata_only",
      requestedDataRegion: parsed.data.requestedDataRegion ?? null,
      configuredDataRegion: configured,
      updatedByUserId: tenant.internalUserId,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: organizationDataControls.organizationId,
      set: { privacyMode: "metadata_only", requestedDataRegion: parsed.data.requestedDataRegion ?? null, configuredDataRegion: configured, updatedByUserId: tenant.internalUserId, updatedAt: now },
    });
    await tx.insert(auditEvents).values({
      id: `aud_${randomUUID()}`,
      organizationId: tenant.organizationId,
      actorType: "user",
      actorId: tenant.internalUserId,
      action: "data_controls.updated",
      resourceType: "organization",
      resourceId: tenant.organizationId,
      details: { privacyMode: "metadata_only", requestedDataRegion: parsed.data.requestedDataRegion ?? null, configuredDataRegion: configured, deploymentDataRegion: deploymentRegion(), residencyClaimed: false },
    });
  });
  return reply({ data: await current(tenant.organizationId) });
}
