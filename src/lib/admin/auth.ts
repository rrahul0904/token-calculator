import { randomUUID } from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { platformAdminAuditEvents, platformAdmins, users, type PlatformAdminRole } from "@/db/schema";
import { getExternalAuthSession } from "@/lib/auth/session";

export class PlatformAdminAuthorizationError extends Error {
  constructor() { super("PLATFORM_ADMIN_REQUIRED"); }
}

export interface PlatformAdminContext {
  id: string;
  workosUserId: string;
  role: PlatformAdminRole;
  email: string;
  name: string | null;
}

const permissions: Record<PlatformAdminRole, ReadonlySet<string>> = {
  super_admin: new Set(["read", "operations", "finance", "admin:manage"]),
  operations: new Set(["read", "operations"]),
  finance: new Set(["read", "finance"]),
  support: new Set(["read"]),
  read_only: new Set(["read"]),
};

export function platformAdminCan(role: PlatformAdminRole, permission: "read" | "operations" | "finance" | "admin:manage") {
  return permissions[role].has(permission);
}

export async function requirePlatformAdmin(permission: "read" | "operations" | "finance" | "admin:manage" = "read"): Promise<PlatformAdminContext> {
  const external = await getExternalAuthSession();
  if (!external || !isDatabaseConfigured()) throw new PlatformAdminAuthorizationError();
  const db = getDb();
  const local = await db.query.users.findFirst({ where: eq(users.workosUserId, external.userId) });
  const identityMatch = local
    ? or(eq(platformAdmins.workosUserId, external.userId), eq(platformAdmins.userId, local.id))
    : eq(platformAdmins.workosUserId, external.userId);
  const admin = (await db.select().from(platformAdmins).where(and(
    isNull(platformAdmins.disabledAt),
    identityMatch,
  )).limit(1))[0];
  if (!admin || !platformAdminCan(admin.role as PlatformAdminRole, permission)) throw new PlatformAdminAuthorizationError();
  return { id: admin.id, workosUserId: external.userId, role: admin.role as PlatformAdminRole, email: external.email, name: external.name };
}

/** Store only non-sensitive facts about platform actions; credentials never enter this ledger. */
export async function recordPlatformAdminAudit(
  actor: PlatformAdminContext,
  input: { action: string; entityType: string; entityId?: string | null; reason?: string | null; metadata?: Record<string, unknown> },
) {
  const db = getDb();
  await db.insert(platformAdminAuditEvents).values({
    id: `pae_${randomUUID()}`,
    actorPlatformAdminId: actor.id,
    actorWorkosUserId: actor.workosUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
  });
}
