import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { auditEvents, providerConnections } from "@/db/schema";
import { getTenantContext, roleCan } from "@/lib/auth/session";
import { verifyProviderCredential } from "@/lib/gateway/provider-connectivity";
import { encryptSecret, isVaultConfigured } from "@/lib/security/vault";

const createSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini"]),
  label: z.string().trim().min(2).max(100),
  credential: z.string().min(8).max(4096),
});

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED" }, 401);
  const rows = await getDb().select({ id: providerConnections.id, provider: providerConnections.provider, label: providerConnections.label, status: providerConnections.status, lastVerifiedAt: providerConnections.lastVerifiedAt, createdAt: providerConnections.createdAt }).from(providerConnections).where(eq(providerConnections.organizationId, tenant.organizationId));
  return reply({ data: rows });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  if (!isVaultConfigured()) return reply({ error: "CREDENTIAL_VAULT_NOT_CONFIGURED" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return reply({ error: "UNAUTHENTICATED" }, 401);
  if (!roleCan(tenant.role, "secrets:manage")) return reply({ error: "FORBIDDEN" }, 403);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

  const verification = await verifyProviderCredential(parsed.data.provider, parsed.data.credential);
  if (!verification.ok) {
    return reply({
      error: "PROVIDER_CREDENTIAL_REJECTED",
      provider: parsed.data.provider,
      upstreamStatus: verification.status,
      detail: verification.detail,
    }, 422);
  }

  const id = `pvc_${randomUUID()}`;
  const aad = `${tenant.organizationId}:${parsed.data.provider}:${id}`;
  const encryptedCredential = encryptSecret(parsed.data.credential, aad);
  const db = getDb();
  const verifiedAt = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(providerConnections).values({
      id,
      organizationId: tenant.organizationId,
      provider: parsed.data.provider,
      label: parsed.data.label,
      encryptedCredential,
      credentialKeyVersion: 1,
      status: "verified",
      lastVerifiedAt: verifiedAt,
    });
    await tx.insert(auditEvents).values({
      id: `aud_${randomUUID()}`,
      organizationId: tenant.organizationId,
      actorType: "user",
      actorId: tenant.internalUserId,
      action: "provider_connection.created_and_verified",
      resourceType: "provider_connection",
      resourceId: id,
      details: { provider: parsed.data.provider, label: parsed.data.label },
    });
  });
  return reply({ data: { id, provider: parsed.data.provider, label: parsed.data.label, status: "verified", lastVerifiedAt: verifiedAt }, warning: "Credential verified, encrypted, and never returned or persisted in plaintext." }, 201);
}
