import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { auditEvents, providerConnections } from "@/db/schema";
import { getTenantContext, roleCan } from "@/lib/auth/session";
import { decryptProviderCredential, encryptProviderCredential } from "@/lib/gateway/provider-credential";
import { verifyProviderCredential, type GatewayProviderName } from "@/lib/gateway/provider-connectivity";
import { isVaultConfigured } from "@/lib/security/vault";

const rotateSchema = z.object({ credential: z.string().min(8).max(4096) });

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function loadConnection(id: string, organizationId: string) {
  const rows = await getDb()
    .select()
    .from(providerConnections)
    .where(and(eq(providerConnections.id, id), eq(providerConnections.organizationId, organizationId)))
    .limit(1);
  return rows[0] ?? null;
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
    credential = decryptProviderCredential(connection);
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
    }).where(and(eq(providerConnections.id, connection.id), eq(providerConnections.organizationId, tenant.organizationId)));
    await tx.insert(auditEvents).values({
      id: `aud_${randomUUID()}`,
      organizationId: tenant.organizationId,
      actorType: "user",
      actorId: tenant.internalUserId,
      action: result.ok ? "provider_connection.verified" : "provider_connection.verification_failed",
      resourceType: "provider_connection",
      resourceId: connection.id,
      details: { provider: connection.provider, status: result.status, credentialKeyVersion: connection.credentialKeyVersion },
    });
  });

  return reply({
    data: {
      id: connection.id,
      provider: connection.provider,
      ok: result.ok,
      status: result.status,
      detail: result.detail,
      verifiedAt: result.ok ? now : null,
      credentialKeyVersion: connection.credentialKeyVersion,
    },
  }, result.ok ? 200 : 422);
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

  const verification = await verifyProviderCredential(connection.provider as GatewayProviderName, parsed.data.credential);
  if (!verification.ok) {
    await getDb().insert(auditEvents).values({
      id: `aud_${randomUUID()}`,
      organizationId: tenant.organizationId,
      actorType: "user",
      actorId: tenant.internalUserId,
      action: "provider_connection.rotation_rejected",
      resourceType: "provider_connection",
      resourceId: connection.id,
      details: { provider: connection.provider, status: verification.status },
    });
    return reply({
      error: "PROVIDER_CREDENTIAL_REJECTED",
      provider: connection.provider,
      upstreamStatus: verification.status,
      detail: verification.detail,
    }, 422);
  }

  const credentialKeyVersion = connection.credentialKeyVersion + 1;
  const encryptedCredential = encryptProviderCredential(
    parsed.data.credential,
    tenant.organizationId,
    connection.provider,
    connection.id,
    credentialKeyVersion,
  );
  const now = new Date();
  await getDb().transaction(async (tx) => {
    await tx.update(providerConnections).set({
      encryptedCredential,
      credentialKeyVersion,
      status: "verified",
      lastVerifiedAt: now,
      updatedAt: now,
    }).where(and(eq(providerConnections.id, connection.id), eq(providerConnections.organizationId, tenant.organizationId)));
    await tx.insert(auditEvents).values({
      id: `aud_${randomUUID()}`,
      organizationId: tenant.organizationId,
      actorType: "user",
      actorId: tenant.internalUserId,
      action: "provider_connection.rotated_and_verified",
      resourceType: "provider_connection",
      resourceId: connection.id,
      details: { provider: connection.provider, credentialKeyVersion },
    });
  });
  return reply({
    data: {
      id: connection.id,
      status: "verified",
      credentialKeyVersion,
      lastVerifiedAt: now,
    },
    warning: "New credential was verified before replacing the prior encrypted value; plaintext was not persisted or returned.",
  });
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
      details: { provider: connection.provider, credentialKeyVersion: connection.credentialKeyVersion },
    });
  });
  return reply({ data: { id, deleted: true } });
}
