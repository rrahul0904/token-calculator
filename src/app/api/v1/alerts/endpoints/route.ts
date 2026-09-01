import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { auditEvents } from "@/db/schema";
import { alertEndpoints } from "@/db/controls-schema";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { getTenantContext, roleCan } from "@/lib/auth/session";
import { encryptAlertUrl, validateAlertDestination } from "@/lib/alerts/webhooks";
import { isVaultConfigured } from "@/lib/security/vault";

const eventType = z.enum(["budget.warned", "budget.blocked", "run.killed", "fallback.approval_required", "provider.connection_failed", "gateway.quota_exceeded"]);
const createSchema = z.object({ name: z.string().trim().min(2).max(100), url: z.string().min(12).max(2048), eventTypes: z.array(eventType).max(20).default([]) });

function reply(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }

export async function GET() {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED" }, 401);
  const rows = await getDb().select({ id: alertEndpoints.id, name: alertEndpoints.name, kind: alertEndpoints.kind, eventTypes: alertEndpoints.eventTypes, enabled: alertEndpoints.enabled, lastDeliveredAt: alertEndpoints.lastDeliveredAt, lastFailureAt: alertEndpoints.lastFailureAt, createdAt: alertEndpoints.createdAt }).from(alertEndpoints).where(eq(alertEndpoints.organizationId, tenant.organizationId));
  return reply({ data: rows });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  if (!isVaultConfigured()) return reply({ error: "CREDENTIAL_VAULT_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED" }, 401);
  if (!roleCan(tenant.role, "integrations:manage")) return reply({ error: "FORBIDDEN" }, 403);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  let safeUrl: string;
  try { safeUrl = await validateAlertDestination(parsed.data.url); } catch (error) { return reply({ error: error instanceof Error ? error.message : "INVALID_WEBHOOK_URL" }, 400); }
  const id = `ale_${randomUUID()}`;
  const encryptedUrl = encryptAlertUrl(safeUrl, tenant.organizationId, id);
  await getDb().transaction(async (tx) => {
    await tx.insert(alertEndpoints).values({ id, organizationId: tenant.organizationId, name: parsed.data.name, kind: "webhook", encryptedUrl, eventTypes: parsed.data.eventTypes, enabled: true });
    await tx.insert(auditEvents).values({ id: `aud_${randomUUID()}`, organizationId: tenant.organizationId, actorType: "user", actorId: tenant.internalUserId, action: "alert_endpoint.created", resourceType: "alert_endpoint", resourceId: id, details: { name: parsed.data.name, eventTypes: parsed.data.eventTypes } });
  });
  return reply({ data: { id, name: parsed.data.name, eventTypes: parsed.data.eventTypes, enabled: true } }, 201);
}
