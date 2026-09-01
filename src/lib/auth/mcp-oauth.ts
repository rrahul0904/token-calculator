import { createPublicKey, verify as verifySignature, type JsonWebKey } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { organizationMembers, organizations, users } from "@/db/schema";

export interface McpOAuthPrincipal {
  kind: "oauth";
  organizationId: string;
  projectId: null;
  serviceAccountId: null;
  apiKeyId?: undefined;
  scopes: string[];
  subject: string;
  workosOrganizationId: string;
}

type JwtHeader = { alg?: string; kid?: string; typ?: string };
type JwtClaims = {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  org_id?: string;
  scope?: string;
  permissions?: string[];
  exp?: number;
  nbf?: number;
  iat?: number;
};
type WorkosJwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

type JwksDocument = { keys?: WorkosJwk[] };

const JWKS_TTL_MS = 5 * 60 * 1000;
let cachedJwks: { issuer: string; expiresAt: number; keys: WorkosJwk[] } | null = null;

function base64UrlJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function configuredIssuer(): string | null {
  const raw = process.env.WORKOS_AUTHKIT_DOMAIN?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.protocol !== "https:") return null;
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function mcpResourceUri(): string | null {
  const explicit = process.env.MCP_RESOURCE_URI?.trim();
  if (explicit) {
    try {
      const parsed = new URL(explicit);
      if (!["https:", "http:"].includes(parsed.protocol)) return null;
      return parsed.toString().replace(/\/$/, "");
    } catch {
      return null;
    }
  }
  const base = process.env.APP_BASE_URL?.trim();
  if (!base) return null;
  try {
    return new URL("/mcp", base).toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function mcpAuthorizationServer(): string | null {
  return configuredIssuer();
}

async function getJwks(issuer: string): Promise<WorkosJwk[]> {
  const now = Date.now();
  if (cachedJwks?.issuer === issuer && cachedJwks.expiresAt > now) return cachedJwks.keys;
  const response = await fetch(`${issuer}/oauth2/jwks`, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("MCP_OAUTH_JWKS_UNAVAILABLE");
  const document = await response.json() as JwksDocument;
  const keys = Array.isArray(document.keys) ? document.keys : [];
  if (!keys.length) throw new Error("MCP_OAUTH_JWKS_EMPTY");
  cachedJwks = { issuer, expiresAt: now + JWKS_TTL_MS, keys };
  return keys;
}

function audienceIncludes(audience: string | string[] | undefined, expected: string): boolean {
  return typeof audience === "string" ? audience === expected : Array.isArray(audience) ? audience.includes(expected) : false;
}

function scopesForClaims(claims: JwtClaims): string[] {
  const fromScope = typeof claims.scope === "string" ? claims.scope.split(/\s+/).filter(Boolean) : [];
  const permissions = Array.isArray(claims.permissions) ? claims.permissions.filter((value): value is string => typeof value === "string") : [];
  return Array.from(new Set([...fromScope, ...permissions]));
}

async function verifyJwt(token: string, issuer: string, resource: string): Promise<JwtClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header: JwtHeader;
  let claims: JwtClaims;
  try {
    header = base64UrlJson<JwtHeader>(parts[0]);
    claims = base64UrlJson<JwtClaims>(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;
  if (claims.iss !== issuer || !audienceIncludes(claims.aud, resource) || !claims.sub || !claims.org_id) return null;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) return null;
  if (typeof claims.nbf === "number" && claims.nbf > nowSeconds + 30) return null;
  if (typeof claims.iat === "number" && claims.iat > nowSeconds + 30) return null;

  const keys = await getJwks(issuer);
  const jwk = keys.find((candidate) => candidate.kid === header.kid && (!candidate.alg || candidate.alg === "RS256"));
  if (!jwk) return null;
  try {
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    const valid = verifySignature(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`, "utf8"),
      publicKey,
      Buffer.from(parts[2], "base64url"),
    );
    return valid ? claims : null;
  } catch {
    return null;
  }
}

function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization");
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function authenticateMcpOAuth(request: Request, requiredScope = "mcp:tools"): Promise<McpOAuthPrincipal | null> {
  if (!isDatabaseConfigured()) return null;
  const issuer = configuredIssuer();
  const resource = mcpResourceUri();
  const token = bearerToken(request);
  if (!issuer || !resource || !token || token.startsWith("ti_live_") || token.startsWith("ti_test_")) return null;

  let claims: JwtClaims | null;
  try {
    claims = await verifyJwt(token, issuer, resource);
  } catch {
    return null;
  }
  if (!claims?.org_id || !claims.sub) return null;
  const scopes = scopesForClaims(claims);
  if (requiredScope && !scopes.includes(requiredScope) && !scopes.includes("*")) return null;

  const db = getDb();
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.workosOrganizationId, claims.org_id),
  });
  if (!organization) return null;

  // User OAuth tokens must map to an actual organization membership. Agent/M2M
  // subjects may not have a users row, but are still tenant-bound by org_id and
  // constrained by the token's explicit MCP scope.
  if (claims.sub.startsWith("user_")) {
    const user = await db.query.users.findFirst({ where: eq(users.workosUserId, claims.sub) });
    if (!user) return null;
    const membership = await db.select({ id: organizationMembers.id }).from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, organization.id), eq(organizationMembers.userId, user.id)))
      .limit(1);
    if (!membership[0]) return null;
  }

  return {
    kind: "oauth",
    organizationId: organization.id,
    projectId: null,
    serviceAccountId: null,
    scopes,
    subject: claims.sub,
    workosOrganizationId: claims.org_id,
  };
}

export function mcpWwwAuthenticateHeader(): string | null {
  const base = process.env.APP_BASE_URL?.trim();
  if (!base) return null;
  try {
    const metadata = new URL("/.well-known/oauth-protected-resource", base).toString();
    return `Bearer error="unauthorized", error_description="Authorization needed", resource_metadata="${metadata}"`;
  } catch {
    return null;
  }
}
