import { and, eq, isNull } from "drizzle-orm";
import { apiKeys } from "@/db/schema";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { getApiKeyLookupPrefix, verifyApiKey } from "@/lib/security/api-keys";
import { getTenantContext, type TenantContext } from "@/lib/auth/session";

export interface ApiPrincipal {
  kind: "api_key";
  apiKeyId: string;
  organizationId: string;
  projectId: string | null;
  serviceAccountId: string | null;
  scopes: string[];
}

export interface SessionPrincipal {
  kind: "session";
  tenant: TenantContext;
  organizationId: string;
  projectId: null;
  scopes: string[];
}

export type AuthPrincipal = ApiPrincipal | SessionPrincipal;

function bearer(request: Request): string | null {
  const value = request.headers.get("authorization");
  if (!value?.toLowerCase().startsWith("bearer ")) return null;
  return value.slice(7).trim();
}

function allows(scopes: string[], required?: string): boolean {
  if (!required) return true;
  return scopes.includes("*") || scopes.includes(required);
}

export async function authenticateApiKey(request: Request, requiredScope?: string): Promise<ApiPrincipal | null> {
  const secret = bearer(request);
  if (!secret || !isDatabaseConfigured()) return null;
  const prefix = getApiKeyLookupPrefix(secret);
  if (!prefix) return null;
  const db = getDb();
  const rows = await db.select().from(apiKeys).where(and(eq(apiKeys.prefix, prefix), isNull(apiKeys.revokedAt))).limit(1);
  const record = rows[0];
  if (!record || !verifyApiKey(secret, record.secretHash)) return null;
  const scopes = Array.isArray(record.scopes) ? record.scopes.filter((scope): scope is string => typeof scope === "string") : [];
  if (!allows(scopes, requiredScope)) return null;
  await db.update(apiKeys).set({ lastUsedAt: new Date(), updatedAt: new Date() }).where(eq(apiKeys.id, record.id));
  return {
    kind: "api_key",
    apiKeyId: record.id,
    organizationId: record.organizationId,
    projectId: record.projectId,
    serviceAccountId: record.serviceAccountId,
    scopes,
  };
}

export async function authenticateRequest(request: Request, requiredScope?: string): Promise<AuthPrincipal | null> {
  const apiPrincipal = await authenticateApiKey(request, requiredScope);
  if (apiPrincipal) return apiPrincipal;
  const tenant = await getTenantContext();
  if (!tenant) return null;
  return {
    kind: "session",
    tenant,
    organizationId: tenant.organizationId,
    projectId: null,
    scopes: ["*"],
  };
}

export async function requirePrincipal(request: Request, requiredScope?: string): Promise<AuthPrincipal> {
  const principal = await authenticateRequest(request, requiredScope);
  if (!principal) throw new Error("UNAUTHORIZED");
  return principal;
}
