import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import type { OrganizationRole } from "@/db/schema";
import { organizationMembers, organizations, users } from "@/db/schema";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { hasWorkosAuthConfiguration } from "@/lib/config";

export interface ExternalAuthSession {
  userId: string;
  email: string;
  name: string | null;
  workosOrganizationId: string | null;
}

export interface TenantContext extends ExternalAuthSession {
  internalUserId: string;
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
  plan: "free" | "pro" | "team" | "enterprise";
}

export function isAuthConfigured(): boolean {
  return hasWorkosAuthConfiguration();
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function getExplicitE2eSession(): Promise<ExternalAuthSession | null> {
  const secret = process.env.TOKEN_INTELLIGENCE_E2E_AUTH_SECRET;
  if (!secret || process.env.TOKEN_INTELLIGENCE_E2E_AUTH_ENABLED !== "1") return null;
  const incoming = (await headers()).get("x-ti-e2e-auth");
  if (!incoming || !safeEqual(incoming, secret)) return null;
  const userId = process.env.TOKEN_INTELLIGENCE_E2E_USER_ID;
  const email = process.env.TOKEN_INTELLIGENCE_E2E_USER_EMAIL;
  const organizationId = process.env.TOKEN_INTELLIGENCE_E2E_WORKOS_ORG_ID;
  if (!userId || !email || !organizationId) return null;
  return { userId, email, name: "Token Intelligence E2E Owner", workosOrganizationId: organizationId };
}

export async function getExternalAuthSession(): Promise<ExternalAuthSession | null> {
  const e2e = await getExplicitE2eSession();
  if (e2e) return e2e;
  if (!isAuthConfigured()) return null;
  const { withAuth } = await import("@workos-inc/authkit-nextjs");
  const auth = await withAuth();
  if (!auth.user) return null;
  const displayName = [auth.user.firstName, auth.user.lastName].filter(Boolean).join(" ") || null;
  return {
    userId: auth.user.id,
    email: auth.user.email,
    name: displayName,
    workosOrganizationId: auth.organizationId ?? null,
  };
}

export async function getTenantContext(): Promise<TenantContext | null> {
  const external = await getExternalAuthSession();
  if (!external || !isDatabaseConfigured()) return null;

  const db = getDb();
  const matchingUser = await db.query.users.findFirst({
    where: eq(users.workosUserId, external.userId),
  });
  if (!matchingUser) return null;

  const membershipRows = await db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      plan: organizations.plan,
      role: organizationMembers.role,
      workosOrganizationId: organizations.workosOrganizationId,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(
      external.workosOrganizationId
        ? and(
            eq(organizationMembers.userId, matchingUser.id),
            eq(organizations.workosOrganizationId, external.workosOrganizationId),
          )
        : eq(organizationMembers.userId, matchingUser.id),
    )
    .limit(1);

  const membership = membershipRows[0];
  if (!membership) return null;
  const role = membership.role as OrganizationRole;
  const plan = membership.plan as TenantContext["plan"];

  return {
    ...external,
    internalUserId: matchingUser.id,
    organizationId: membership.organizationId,
    organizationName: membership.organizationName,
    role,
    plan,
  };
}

const PERMISSIONS = {
  owner: new Set(["org:manage", "billing:manage", "integrations:manage", "secrets:manage", "policy:manage", "api_keys:manage", "usage:read", "runs:read", "exports:read", "scenarios:write"]),
  admin: new Set(["org:manage", "integrations:manage", "secrets:manage", "policy:manage", "api_keys:manage", "usage:read", "runs:read", "exports:read", "scenarios:write"]),
  finance: new Set(["billing:manage", "usage:read", "runs:read", "exports:read"]),
  developer: new Set(["api_keys:self", "usage:read", "runs:read", "scenarios:write"]),
  viewer: new Set(["usage:read", "runs:read"]),
} satisfies Record<OrganizationRole, Set<string>>;

export function roleCan(role: OrganizationRole, permission: string): boolean {
  return PERMISSIONS[role].has(permission);
}

export async function requireTenant(permission?: string): Promise<TenantContext> {
  const tenant = await getTenantContext();
  if (!tenant) throw new Error("AUTH_OR_TENANT_REQUIRED");
  if (permission && !roleCan(tenant.role, permission)) throw new Error("FORBIDDEN");
  return tenant;
}
