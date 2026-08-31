import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { auditEvents, providerConnections } from "@/db/schema";
import { getTenantContext, roleCan } from "@/lib/auth/session";
import { decryptSecret, encryptSecret, isVaultConfigured } from "@/lib/security/vault";
import { verifyProviderCredential, type GatewayProviderName } from "@/lib/gateway/provider-connectivity";

const rotateSchema = z.object({ credential: z.string().min(8).max(4096) });

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function loadConnection(id: string, organizationId: string) {
  const rows = await getDb().select().from(providerConnections).where(and(eq(providerConnections.id, id), eq(providerConnections.organizationId, organizationId))).limit(1);
  return rows[0] ?? null;
}

function aad(organizationId: string, provider: string, id: string) {
  return `${organizationId}:${provider}:${id}`;
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  if (!isVaultConfigured()) return reply({ error: "CREDENTIAL_VAULT_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED" }, 401);
  if (!roleCan(tenant.role, "secrets:manage")) return reply({ error: "FORBIDDEN" }, 403);
  const { id } = await context.params;
  const connection = await loadConnection(id, tenant.organizationId);
  if (!connection) return reply({ error: "NOT_FOUND" }, 404);

  let credential: string;
  try {
    credential = decryptSecret(connection.encryptedCredential, aad(tenant.organizationId, connection.provider, connection.id));
  } catch {
    return reply({ error: "CREDENTIAL_DECRYPTION_FAILED" }, 500);
  }

  const result = await verifyProviderCredential(connection.provider as GatewayProviderName, credential);
  const now = new Date();
  await getDb().transaction(async (tx) => {
    await tx.update(providerConnections).set({
      status: result.ok ? "verified" : "verification_failed",
      lastVerifiedAt: result.ok ? now : connection.lastVerifiedAt,
      updatedAt: now,
    }).where(eq(providerConnections.id, connection.id));
    await tx.insert(auditEvents).values({
      id: `aud_${randomUUID()}`,
      organizationId: tenant.organizationId,
      actorType: "user",
      actorId: tenant.internalUserId,
      action: result.ok ? "provider_connection.verified" : "provider_connection.verification_failed",
      resourceType: "provider_connection",
      resourceId: connection.id,
      details: { provider: connection.provider, status: result.status },
    });
  });

  return reply({ data: { id: connection.id, provider: connection.provider, ok: result.ok, status: result.status, detail: result.detail, verifiedAt: result.ok ? now : null } }, result.ok ? 200 : 422);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  if (!isVaultConfigured()) return reply({ error: "CREDENTIAL_VAULT_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED" }, 401);
  if (!roleCan(tenant.role, "secrets:manage")) return reply({ error: "FORBIDDEN" }, 403);
  const parsed = rotateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  const { id } = await context.params;
  const connection = await loadConnection(id, tenant.organizationId);
  if (!connection) return reply({ error: "NOT_FOUND" }, 404);

  const encryptedCredential = encryptSecret(parsed.data.credential, aad(tenant.organizationId, connection.provider, connection.id));
  const now = new Date();
  await getDb().transaction(async (tx) => {
    await tx.update(providerConnections).set({ encryptedCredential, credentialKeyVersion: connection.credentialKeyVersion + 1, status: "active", lastVerifiedAt: null, updatedAt: now }).where(eq(providerConnections.id, connection.id));
    await tx.insert(auditEvents).values({
      id: `aud_${randomUUID()}`,
      organizationId: tenant.organizationId,
      actorType: "user",
      actorId: tenant.internalUserId,
      action: "provider_connection.rotated",
      resourceType: "provider_connection",
      resourceId: connection.id,
      details: { provider: connection.provider, credentialKeyVersion: connection.credentialKeyVersion + 1 },
    });
  });
  return reply({ data: { id: connection.id, status: "active", credentialKeyVersion: connection.credentialKeyVersion + 1 }, warning: "New credential encrypted; plaintext was not persisted or returned." });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED" }, 401);
  if (!roleCan(tenant.role, "secrets:manage")) return reply({ error: "FORBIDDEN" }, 403);
  const { id } = await context.params;
  const connection = await loadConnection(id, tenant.organizationId);
  if (!connection) return reply({ error: "NOT_FOUND" }, 404);

  await getDb().transaction(async (tx) => {
    await tx.delete(providerConnections).where(and(eq(providerConnections.id, id), eq(providerConnections.organizationId, tenant.organizationId)));
    await tx.insert(auditEvents).values({
      id: `aud_${randomUUID()}`,
      organizationId: tenant.organizationId,
      actorType: "user",
      actorId: tenant.internalUserId,
      action: "provider_connection.deleted",
      resourceType: "provider_connection",
      resourceId: id,
      details: { provider: connection.provider },
    });
  });
  return reply({ data: { id, deleted: true } });
}
